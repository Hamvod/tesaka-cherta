import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import {
  accountProfiles,
  auctions,
  bids,
  InsertUser,
  paymentEvents,
  paymentOrders,
  users,
  watchlist,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;
let _client: ReturnType<typeof postgres> | null = null;

const seedAuctions = [
  { slug: "a17-pro-256gb", title: "A17 Pro · 256GB", category: "Phones", imagePath: "/manus-storage/tesaka_cherta_phone_74bf5de2.jpg", sellerName: "Nile Mobile", bidFee: "50.00", endsAt: new Date("2026-09-26T17:00:00.000Z"), status: "live" as const },
  { slug: "vision-55-4k-smart-tv", title: "Vision 55 4K Smart TV", category: "Home tech", imagePath: "/manus-storage/tesaka_cherta_tv_503427d1.jpg", sellerName: "Habesha Home", bidFee: "45.00", endsAt: new Date("2026-09-22T15:30:00.000Z"), status: "live" as const },
  { slug: "soundarc-studio-anc", title: "SoundArc Studio ANC", category: "Audio", imagePath: "/manus-storage/tesaka_cherta_headphones_dd2c6f2e.jpg", sellerName: "Addis Audio", bidFee: "35.00", endsAt: new Date("2026-09-30T16:15:00.000Z"), status: "live" as const },
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
      console.warn("[Database] Failed to connect to Supabase Postgres:", error);
      _db = null;
      _client = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  const values: InsertUser = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  type TextField = (typeof textFields)[number];

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
  const existing = await db.select({ id: auctions.id }).from(auctions).limit(1);
  if (existing.length === 0) await db.insert(auctions).values(seedAuctions);
}

export async function listLiveAuctions() {
  const db = await getDb();
  if (!db) return [];
  await ensureAuctionCatalog(db);
  return db.select().from(auctions).where(eq(auctions.status, "live")).orderBy(auctions.endsAt);
}

export async function getAuctionById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  await ensureAuctionCatalog(db);
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
  return db.select({ id: bids.id, amount: bids.amount, createdAt: bids.createdAt, auctionId: bids.auctionId, auctionTitle: auctions.title, auctionImagePath: auctions.imagePath, auctionStatus: auctions.status }).from(bids).innerJoin(auctions, eq(bids.auctionId, auctions.id)).where(eq(bids.userId, userId)).orderBy(desc(bids.createdAt));
}

export async function createBid(userId: number, auctionId: number, amount: string, paymentOrderId?: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const auction = await getAuctionById(auctionId);
  if (!auction || auction.status !== "live") throw new Error("This auction is not live");
  if (auction.endsAt.getTime() <= Date.now()) throw new Error("This auction has ended");
  if (!paymentOrderId) throw new Error("A verified Telebirr payment is required before bidding");
  const payment = await db.select().from(paymentOrders).where(and(eq(paymentOrders.id, paymentOrderId), eq(paymentOrders.userId, userId), eq(paymentOrders.auctionId, auctionId))).limit(1);
  if (!payment[0] || payment[0].status !== "paid") throw new Error("Telebirr payment has not been verified");
  const created = await db.insert(bids).values({ userId, auctionId, amount }).returning({ id: bids.id });
  return { id: created[0]?.id, auctionId, amount };
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
  return db.select({ id: watchlist.id, auctionId: watchlist.auctionId, title: auctions.title, imagePath: auctions.imagePath, endsAt: auctions.endsAt }).from(watchlist).innerJoin(auctions, eq(watchlist.auctionId, auctions.id)).where(eq(watchlist.userId, userId)).orderBy(desc(watchlist.createdAt));
}

export async function createTelebirrPaymentOrder(userId: number, auctionId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const auction = await getAuctionById(auctionId);
  if (!auction || auction.status !== "live") throw new Error("This auction is not live");
  if (auction.endsAt.getTime() <= Date.now()) throw new Error("This auction has ended");

  const existingPending = await db.select().from(paymentOrders).where(and(eq(paymentOrders.userId, userId), eq(paymentOrders.auctionId, auctionId), eq(paymentOrders.status, "pending"))).orderBy(desc(paymentOrders.createdAt)).limit(1);
  if (existingPending[0]) return { id: existingPending[0].id, merchantReference: existingPending[0].merchantReference, amount: existingPending[0].amount, currency: existingPending[0].currency, status: existingPending[0].status, provider: existingPending[0].provider, checkoutUrl: existingPending[0].checkoutUrl, ready: false };

  const { nanoid } = await import("nanoid");
  const merchantReference = `TC-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${nanoid(10).toUpperCase()}`;
  const created = await db.insert(paymentOrders).values({ userId, auctionId, provider: "telebirr", merchantReference, amount: auction.bidFee, currency: "ETB", status: "pending" }).returning({ id: paymentOrders.id });
  return { id: created[0]?.id, merchantReference, amount: auction.bidFee, currency: "ETB" as const, status: "pending" as const, provider: "telebirr" as const, checkoutUrl: null, ready: Boolean(ENV.telebirrBaseUrl && ENV.telebirrAppId && ENV.telebirrAppKey) };
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
  await db.insert(paymentEvents).values({ provider: "telebirr", merchantReference: input.merchantReference, eventType: input.eventType, providerReference: input.providerReference ?? null, payloadHash: input.payloadHash ?? null }).onConflictDoUpdate({ target: [paymentEvents.provider, paymentEvents.merchantReference, paymentEvents.eventType, paymentEvents.providerReference], set: { receivedAt: new Date() } });
  return { accepted: true } as const;
}
