import { createHash, randomBytes } from "node:crypto";
import { and, asc, count, desc, eq, gt, lte, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  accountProfiles,
  auditLogs,
  auctionResults,
  auctions,
  bids,
  InsertUser,
  paymentEvents,
  paymentOrders,
  reports,
  users,
  watchlist,
} from "../drizzle/schema.js";
import { ENV } from "./_core/env.js";
import { calculateLowestUniqueBid, maskPhone } from "./auction-engine.js";

let _db: ReturnType<typeof drizzle> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

const seedAuctions = [
  { slug: "a17-pro-256gb", title: "A17 Pro · 256GB", category: "Phones", imagePath: "/manus-storage/tesaka_cherta_phone_74bf5de2.jpg", sellerName: "Nile Mobile", bidFee: "50.00", startsAt: new Date(), endsAt: new Date(Date.now() + 7 * 86400000), minBid: "0.10", maxBid: "100.00", maxBidsPerUser: 10, status: "live" as const },
  { slug: "vision-55-4k-smart-tv", title: "Vision 55 4K Smart TV", category: "Home tech", imagePath: "/manus-storage/tesaka_cherta_tv_503427d1.jpg", sellerName: "Habesha Home", bidFee: "45.00", startsAt: new Date(), endsAt: new Date(Date.now() + 10 * 86400000), minBid: "0.10", maxBid: "100.00", maxBidsPerUser: 10, status: "live" as const },
  { slug: "soundarc-studio-anc", title: "SoundArc Studio ANC", category: "Audio", imagePath: "/manus-storage/tesaka_cherta_headphones_dd2c6f2e.jpg", sellerName: "Addis Audio", bidFee: "35.00", startsAt: new Date(), endsAt: new Date(Date.now() + 14 * 86400000), minBid: "0.10", maxBid: "100.00", maxBidsPerUser: 10, status: "live" as const },
];

export async function getDb() {
  if (!_db && ENV.databaseUrl) {
    try {
      _client = postgres(ENV.databaseUrl, {
        max: 1,
        prepare: false,
        connect_timeout: 10,
        idle_timeout: 20,
      });
      _db = drizzle(_client);
    } catch (error) {
      console.warn("[Database] Failed to connect to Postgres:", error);
      _db = null;
      _client = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    const value = user[field];
    if (value !== undefined) {
      values[field] = value ?? null;
      updateSet[field] = value ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  }
  if (!values.lastSignedIn) values.lastSignedIn = new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onConflictDoUpdate({ target: users.openId, set: updateSet });
}

export async function syncSupabaseUser(input: {
  supabaseId: string;
  email: string | null;
  name: string | null;
  loginMethod?: string;
}): Promise<NonNullable<Awaited<ReturnType<typeof getUserByOpenId>>> | undefined> {
  const role =
    input.email && ENV.supabaseAdminEmail && input.email.toLowerCase() === ENV.supabaseAdminEmail.trim().toLowerCase()
      ? "admin"
      : "user";
  await upsertUser({
    openId: input.supabaseId,
    name: input.name,
    email: input.email,
    loginMethod: input.loginMethod ?? "google",
    role,
    lastSignedIn: new Date(),
  });
  return getUserByOpenId(input.supabaseId);
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

async function ensureAuctionCatalog(db: NonNullable<Awaited<ReturnType<typeof getDb>>>) {
  if (ENV.isProduction) return;
  const existing = await db.select({ id: auctions.id }).from(auctions).limit(1);
  if (existing.length === 0) await db.insert(auctions).values(seedAuctions);
}

export async function listLiveAuctions() {
  const db = await getDb();
  if (!db) return [];
  await ensureAuctionCatalog(db);
  await closeExpiredAuctions();
  const rows = await db.select().from(auctions)
    .where(and(eq(auctions.status, "live"), gt(auctions.endsAt, new Date())))
    .orderBy(asc(auctions.startsAt), asc(auctions.endsAt)).limit(100);
  return Promise.all(rows.map(async (auction) => {
    const [result] = await db.select({ value: count() }).from(bids)
      .where(and(eq(bids.auctionId, auction.id), eq(bids.status, "valid")));
    return { ...auction, bidCount: Number(result?.value ?? 0) };
  }));
}

export async function getAuctionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  await ensureAuctionCatalog(db);
  await closeExpiredAuctions();
  const result = await db.select().from(auctions).where(eq(auctions.id, id)).limit(1);
  return result[0];
}

export async function getOrCreateProfile(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const existing = await db.select().from(accountProfiles).where(eq(accountProfiles.userId, userId)).limit(1);
  if (existing[0]) return existing[0];
  const created = await db.insert(accountProfiles).values({ userId }).returning();
  return created[0];
}

export async function updateProfile(userId: number, values: { phone?: string | null; city?: string | null; language?: "en" | "am"; marketingOptIn?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await getOrCreateProfile(userId);
  await db.update(accountProfiles).set({ ...values, updatedAt: new Date() }).where(eq(accountProfiles.userId, userId));
  return getOrCreateProfile(userId);
}

export async function listUserBids(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: bids.id,
    amount: bids.amount,
    status: bids.status,
    createdAt: bids.createdAt,
    auctionId: bids.auctionId,
    auctionTitle: auctions.title,
    auctionImagePath: auctions.imagePath,
    auctionStatus: auctions.status,
    resultType: auctionResults.resultType,
    isWinningBid: sql<boolean>`${bids.id} = ${auctionResults.winningBidId}`.as("isWinningBid"),
  })
    .from(bids)
    .innerJoin(auctions, eq(bids.auctionId, auctions.id))
    .leftJoin(auctionResults, eq(auctionResults.auctionId, auctions.id))
    .where(eq(bids.userId, userId))
    .orderBy(desc(bids.createdAt));
}

export async function listUserWins(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    auctionId: auctionResults.auctionId,
    title: auctions.title,
    imagePath: auctions.imagePath,
    winningAmount: auctionResults.winningAmount,
    referenceCode: auctionResults.referenceCode,
    publishedAt: auctionResults.publishedAt,
  }).from(auctionResults)
    .innerJoin(auctions, eq(auctionResults.auctionId, auctions.id))
    .where(eq(auctionResults.winnerUserId, userId))
    .orderBy(desc(auctionResults.publishedAt));
}

export async function createBid(userId: number, auctionId: number, amount: string, paymentOrderId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const created = await db.transaction(async (tx) => {
    const [auction] = await tx.select().from(auctions).where(eq(auctions.id, auctionId)).for("update").limit(1);
    const now = new Date();
    if (!auction || auction.status !== "live") throw new Error("This auction is not accepting bids");
    if (auction.startsAt.getTime() > now.getTime()) throw new Error("This auction has not started yet");
    if (auction.endsAt.getTime() <= now.getTime()) throw new Error("This auction has ended");
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0 || numericAmount < Number(auction.minBid) || numericAmount > Number(auction.maxBid)) {
      throw new Error(`Bid must be between ${auction.minBid} and ${auction.maxBid} ETB`);
    }
    const [payment] = await tx.select().from(paymentOrders)
      .where(and(eq(paymentOrders.id, paymentOrderId), eq(paymentOrders.userId, userId), eq(paymentOrders.auctionId, auctionId)))
      .for("update").limit(1);
    if (!payment || payment.status !== "paid") throw new Error("A verified payment is required before bidding");
    const [reusedOrder] = await tx.select({ id: bids.id }).from(bids).where(eq(bids.paymentOrderId, paymentOrderId)).limit(1);
    if (reusedOrder) throw new Error("This payment has already been used for a bid");
    const [bidCount] = await tx.select({ value: count() }).from(bids)
      .where(and(eq(bids.auctionId, auctionId), eq(bids.userId, userId), eq(bids.status, "valid")));
    if (Number(bidCount?.value ?? 0) >= auction.maxBidsPerUser) throw new Error("You have reached the bid limit for this auction");
    const [row] = await tx.insert(bids).values({ userId, auctionId, amount, paymentOrderId, status: "valid" }).returning({ id: bids.id, amount: bids.amount });
    await tx.insert(auditLogs).values({ actorId: userId, action: "bid.accepted", entityType: "bid", entityId: String(row.id), newValue: { auctionId, amount: row.amount, paymentOrderId } });
    return row;
  });
  return { id: created.id, auctionId, amount: created.amount };
}

export async function toggleWatchlist(userId: number, auctionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(watchlist).where(and(eq(watchlist.userId, userId), eq(watchlist.auctionId, auctionId))).limit(1);
  if (existing[0]) {
    await db.delete(watchlist).where(eq(watchlist.id, existing[0].id));
    return { saved: false } as const;
  }
  await db.insert(watchlist).values({ userId, auctionId });
  return { saved: true } as const;
}

export async function listUserWatchlist(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: watchlist.id, auctionId: watchlist.auctionId, title: auctions.title, imagePath: auctions.imagePath, endsAt: auctions.endsAt })
    .from(watchlist).innerJoin(auctions, eq(watchlist.auctionId, auctions.id))
    .where(eq(watchlist.userId, userId)).orderBy(desc(watchlist.createdAt));
}

export async function createTelebirrPaymentOrder(userId: number, auctionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const auction = await getAuctionById(auctionId);
  if (!auction || auction.status !== "live" || auction.startsAt.getTime() > Date.now() || auction.endsAt.getTime() <= Date.now()) {
    throw new Error("This auction is not accepting payments");
  }
  const provider = ENV.enableTestPayments ? "sandbox" as const : "telebirr" as const;
  const existingPending = await db.select().from(paymentOrders)
    .where(and(eq(paymentOrders.userId, userId), eq(paymentOrders.auctionId, auctionId), eq(paymentOrders.provider, provider), eq(paymentOrders.status, "pending")))
    .orderBy(desc(paymentOrders.createdAt)).limit(1);
  if (existingPending[0]) {
    const order = existingPending[0];
    return { id: order.id, merchantReference: order.merchantReference, amount: order.amount, currency: order.currency, status: order.status, provider: order.provider, checkoutUrl: order.checkoutUrl, ready: Boolean(order.checkoutUrl), sandboxEnabled: ENV.enableTestPayments };
  }
  const { nanoid } = await import("nanoid");
  const merchantReference = `TC-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${nanoid(10).toUpperCase()}`;
  const created = await db.insert(paymentOrders).values({ userId, auctionId, provider, merchantReference, amount: auction.bidFee, currency: "ETB", status: "pending" }).returning({ id: paymentOrders.id });
  return { id: created[0]?.id, merchantReference, amount: auction.bidFee, currency: "ETB" as const, status: "pending" as const, provider, checkoutUrl: null, ready: false, sandboxEnabled: ENV.enableTestPayments };
}

export async function completeSandboxPayment(userId: number, paymentOrderId: number) {
  if (!ENV.enableTestPayments) throw new Error("Sandbox payments are disabled in this environment");
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(paymentOrders)
      .where(and(eq(paymentOrders.id, paymentOrderId), eq(paymentOrders.userId, userId)))
      .for("update").limit(1);
    if (!order || order.provider !== "sandbox") throw new Error("Sandbox payment order not found");
    if (order.status === "paid") return { id: order.id, status: "paid" as const };
    if (order.status !== "pending") throw new Error("This payment order is not pending");
    const [updated] = await tx.update(paymentOrders).set({ status: "paid", updatedAt: new Date() })
      .where(eq(paymentOrders.id, paymentOrderId)).returning({ id: paymentOrders.id });
    await tx.insert(auditLogs).values({ actorId: userId, action: "payment.sandbox_completed", entityType: "payment", entityId: String(paymentOrderId), newValue: { provider: "sandbox", merchantReference: order.merchantReference } });
    return { id: updated.id, status: "paid" as const };
  });
}

export async function getLatestUserPaymentOrder(userId: number, auctionId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(paymentOrders).where(and(eq(paymentOrders.userId, userId), eq(paymentOrders.auctionId, auctionId))).orderBy(desc(paymentOrders.createdAt)).limit(1);
  return result[0];
}

export async function recordTelebirrPaymentEvent(input: { merchantReference: string; eventType: string; providerReference?: string; payloadHash?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.insert(paymentEvents).values({ provider: "telebirr", merchantReference: input.merchantReference, eventType: input.eventType, providerReference: input.providerReference ?? null, payloadHash: input.payloadHash ?? null })
    .onConflictDoUpdate({ target: [paymentEvents.provider, paymentEvents.merchantReference, paymentEvents.eventType, paymentEvents.providerReference], set: { receivedAt: new Date() } });
  return { accepted: true } as const;
}

export async function createAuction(actorId: number, input: { title: string; category: string; imagePath: string; sellerName: string; bidFee: string; startsAt: Date; endsAt: Date; minBid: string; maxBid: string; maxBidsPerUser: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  if (input.endsAt.getTime() <= input.startsAt.getTime()) throw new Error("Auction end time must be after its start time");
  if (Number(input.bidFee) <= 0 || Number(input.minBid) <= 0 || Number(input.maxBid) < Number(input.minBid)) throw new Error("Auction fees and bid limits are invalid");
  const { nanoid } = await import("nanoid");
  const slug = `${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 90) || "auction"}-${nanoid(6).toLowerCase()}`;
  const [created] = await db.transaction(async (tx) => {
    const rows = await tx.insert(auctions).values({ ...input, slug, status: "draft" }).returning();
    await tx.insert(auditLogs).values({ actorId, action: "auction.created", entityType: "auction", entityId: String(rows[0].id), newValue: { slug, title: input.title, status: "draft" } });
    return rows;
  });
  return created;
}

export async function publishAuction(actorId: number, auctionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const [auction] = await tx.select().from(auctions).where(eq(auctions.id, auctionId)).for("update").limit(1);
    if (!auction) throw new Error("Auction not found");
    if (auction.status === "closed") throw new Error("Closed auctions cannot be published again");
    if (auction.endsAt.getTime() <= Date.now()) throw new Error("Auction end time must be in the future");
    const [updated] = await tx.update(auctions).set({ status: "live" }).where(eq(auctions.id, auctionId)).returning();
    await tx.insert(auditLogs).values({ actorId, action: "auction.published", entityType: "auction", entityId: String(auctionId), oldValue: { status: auction.status }, newValue: { status: "live" } });
    return updated;
  });
}

export async function closeAuction(auctionId: number, actorId: number | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const [existingResult] = await tx.select().from(auctionResults).where(eq(auctionResults.auctionId, auctionId)).limit(1);
    if (existingResult) return existingResult;
    const [auction] = await tx.select().from(auctions).where(eq(auctions.id, auctionId)).for("update").limit(1);
    if (!auction) throw new Error("Auction not found");
    if (actorId === null && auction.endsAt.getTime() > Date.now()) throw new Error("Auction has not reached its scheduled end time");
    const validBids = await tx.select({ id: bids.id, userId: bids.userId, amount: bids.amount, status: bids.status })
      .from(bids).where(and(eq(bids.auctionId, auctionId), eq(bids.status, "valid"))).orderBy(asc(bids.id));
    const calculation = calculateLowestUniqueBid(validBids);
    const referenceCode = `CH-${auction.id}-${randomBytes(4).toString("hex").toUpperCase()}`;
    const canonicalBids = validBids.map((bid) => `${bid.id}:${bid.userId}:${bid.amount}`).join("|");
    const resultHash = createHash("sha256").update(`${auction.id}|${canonicalBids}`).digest("hex");
    await tx.update(auctions).set({ status: "closed" }).where(eq(auctions.id, auctionId));
    const resultType = calculation.winningBid ? "winner" as const : "no_unique_bid" as const;
    const [result] = await tx.insert(auctionResults).values({
      auctionId,
      resultType,
      winningBidId: calculation.winningBid?.id ?? null,
      winnerUserId: calculation.winningBid?.userId ?? null,
      winningAmount: calculation.winningBid?.amount ?? null,
      validBidCount: calculation.validBidCount,
      referenceCode,
      resultHash,
      publishedAt: new Date(),
    }).returning();
    await tx.insert(auditLogs).values({ actorId, action: "auction.result_published", entityType: "auction", entityId: String(auctionId), newValue: { resultType, referenceCode, resultHash, validBidCount: calculation.validBidCount, winningBidId: calculation.winningBid?.id ?? null } });
    return result;
  });
}

export async function closeExpiredAuctions() {
  const db = await getDb();
  if (!db) return 0;
  const expired = await db.select({ id: auctions.id }).from(auctions)
    .where(and(eq(auctions.status, "live"), lte(auctions.endsAt, new Date())))
    .orderBy(asc(auctions.endsAt)).limit(25);
  let closedCount = 0;
  for (const auction of expired) {
    try {
      await closeAuction(auction.id, null);
      closedCount += 1;
    } catch (error) {
      console.error(`[Auction] Unable to close expired auction ${auction.id}`, error);
    }
  }
  return closedCount;
}

export async function listPublishedResults() {
  const db = await getDb();
  if (!db) return [];
  await closeExpiredAuctions();
  const rows = await db.select({
    auctionId: auctionResults.auctionId,
    title: auctions.title,
    category: auctions.category,
    imagePath: auctions.imagePath,
    sellerName: auctions.sellerName,
    resultType: auctionResults.resultType,
    winningAmount: auctionResults.winningAmount,
    referenceCode: auctionResults.referenceCode,
    resultHash: auctionResults.resultHash,
    validBidCount: auctionResults.validBidCount,
    publishedAt: auctionResults.publishedAt,
    winnerName: users.name,
    phone: accountProfiles.phone,
  }).from(auctionResults)
    .innerJoin(auctions, eq(auctionResults.auctionId, auctions.id))
    .leftJoin(users, eq(auctionResults.winnerUserId, users.id))
    .leftJoin(accountProfiles, eq(auctionResults.winnerUserId, accountProfiles.userId))
    .orderBy(desc(auctionResults.publishedAt));
  return rows.map(({ phone, ...result }) => ({ ...result, maskedPhone: maskPhone(phone) }));
}

export async function getAdminDashboardStats() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await closeExpiredAuctions();
  const [userCount, activeUserCount, openReportCount, liveCount, completedCount, bidCount, paymentCount, winnerCount] = await Promise.all([
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(users).where(eq(users.status, "active")),
    db.select({ value: count() }).from(reports).where(eq(reports.status, "open")),
    db.select({ value: count() }).from(auctions).where(eq(auctions.status, "live")),
    db.select({ value: count() }).from(auctionResults),
    db.select({ value: count() }).from(bids),
    db.select({ value: count() }).from(paymentOrders),
    db.select({ value: count() }).from(auctionResults).where(eq(auctionResults.resultType, "winner")),
  ]);
  return {
    totalUsers: Number(userCount[0]?.value ?? 0),
    activeUsers: Number(activeUserCount[0]?.value ?? 0),
    openReports: Number(openReportCount[0]?.value ?? 0),
    liveAuctions: Number(liveCount[0]?.value ?? 0),
    completedAuctions: Number(completedCount[0]?.value ?? 0),
    totalBids: Number(bidCount[0]?.value ?? 0),
    paymentOrders: Number(paymentCount[0]?.value ?? 0),
    winners: Number(winnerCount[0]?.value ?? 0),
  };
}

export async function listAdminAuctions() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await closeExpiredAuctions();
  return db.select().from(auctions).orderBy(desc(auctions.createdAt));
}

export async function listAdminUsers() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select({ id: users.id, name: users.name, email: users.email, role: users.role, status: users.status, createdAt: users.createdAt, lastSignedIn: users.lastSignedIn })
    .from(users).orderBy(desc(users.lastSignedIn)).limit(100);
}

export async function updateUserStatus(actorId: number, targetUserId: number, status: "active" | "suspended") {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const [target] = await tx.select().from(users).where(eq(users.id, targetUserId)).for("update").limit(1);
    if (!target) throw new Error("User not found");
    if (target.id === actorId) throw new Error("You cannot change your own account status");
    if (target.role === "admin") throw new Error("Administrator accounts cannot be suspended from this screen");
    if (target.status === status) return target;
    const [updated] = await tx.update(users).set({ status, updatedAt: new Date() }).where(eq(users.id, targetUserId)).returning();
    await tx.insert(auditLogs).values({
      actorId,
      action: status === "suspended" ? "user.suspended" : "user.reactivated",
      entityType: "user",
      entityId: String(targetUserId),
      oldValue: { status: target.status },
      newValue: { status },
    });
    return updated;
  });
}

export async function submitUserReport(reporterId: number, input: { category: string; subject: string; details: string; targetType?: string | null; targetId?: string | null }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(${reporterId})`);
    const [recent] = await tx.select({ value: count() }).from(reports)
      .where(and(eq(reports.reporterId, reporterId), gt(reports.createdAt, new Date(Date.now() - 60 * 60 * 1000))));
    if (Number(recent?.value ?? 0) >= 5) throw new Error("Report limit reached. Please wait before sending another report.");
    const [created] = await tx.insert(reports).values({
      reporterId,
      category: input.category,
      subject: input.subject,
      details: input.details,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
    }).returning();
    await tx.insert(auditLogs).values({ actorId: reporterId, action: "report.submitted", entityType: "report", entityId: String(created.id), newValue: { category: created.category, subject: created.subject } });
    return created;
  });
}

export async function listUserReports(reporterId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select({ id: reports.id, category: reports.category, subject: reports.subject, status: reports.status, createdAt: reports.createdAt })
    .from(reports).where(eq(reports.reporterId, reporterId)).orderBy(desc(reports.createdAt)).limit(50);
}

export async function listAdminReports() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select({
    id: reports.id,
    reporterId: reports.reporterId,
    reporterName: users.name,
    reporterEmail: users.email,
    category: reports.category,
    subject: reports.subject,
    details: reports.details,
    targetType: reports.targetType,
    targetId: reports.targetId,
    status: reports.status,
    adminNotes: reports.adminNotes,
    createdAt: reports.createdAt,
    updatedAt: reports.updatedAt,
  }).from(reports).innerJoin(users, eq(reports.reporterId, users.id)).orderBy(desc(reports.createdAt)).limit(100);
}

export async function updateAdminReport(actorId: number, reportId: number, status: "open" | "reviewing" | "resolved" | "dismissed", adminNotes: string | null) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.transaction(async (tx) => {
    const [report] = await tx.select().from(reports).where(eq(reports.id, reportId)).for("update").limit(1);
    if (!report) throw new Error("Report not found");
    const [updated] = await tx.update(reports).set({ status, adminNotes, reviewedBy: actorId, updatedAt: new Date() }).where(eq(reports.id, reportId)).returning();
    await tx.insert(auditLogs).values({ actorId, action: "report.review_updated", entityType: "report", entityId: String(reportId), oldValue: { status: report.status }, newValue: { status } });
    return updated;
  });
}

export async function listAdminPayments() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select({ id: paymentOrders.id, userId: paymentOrders.userId, auctionId: paymentOrders.auctionId, provider: paymentOrders.provider, merchantReference: paymentOrders.merchantReference, amount: paymentOrders.amount, currency: paymentOrders.currency, status: paymentOrders.status, createdAt: paymentOrders.createdAt, auctionTitle: auctions.title, userEmail: users.email })
    .from(paymentOrders).innerJoin(auctions, eq(paymentOrders.auctionId, auctions.id)).innerJoin(users, eq(paymentOrders.userId, users.id))
    .orderBy(desc(paymentOrders.createdAt)).limit(100);
}

export async function listAuditLogs() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  return db.select().from(auditLogs).orderBy(desc(auditLogs.createdAt)).limit(100);
}
