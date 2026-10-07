import { getIdTokenResult, type User as FirebaseUser } from "firebase/auth";
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { firestore } from "./firebase";
import { amountToCents, calculateLowestUniqueBid } from "./auctionEngine";

export type AccountProfile = {
  phone: string | null;
  city: string | null;
  language: "en" | "am";
  marketingOptIn: boolean;
};

export type SavedAuction = {
  id: string;
  auctionId: string;
  title: string;
  imagePath: string;
  endsAt: Date;
};

export type AuctionStatus = "draft" | "live" | "closed";
export type AuctionRecord = {
  id: string;
  title: string;
  category: string;
  imagePath: string;
  sellerName: string;
  bidFee: number;
  minBid: number;
  maxBid: number;
  maxBidsPerUser: number;
  startsAt: Date;
  endsAt: Date;
  status: AuctionStatus;
  bidCount: number;
  createdAt: Date;
};

export type BidRecord = {
  id: string;
  auctionId: string;
  amount: number;
  createdAt: Date;
  auctionTitle: string;
  auctionImagePath: string;
  auctionStatus: AuctionStatus;
  isWinningBid: boolean;
};

export type AuctionResult = {
  id: string;
  auctionId: string;
  title: string;
  category: string;
  imagePath: string;
  resultType: "winner" | "no_unique_bid";
  winningAmount: number | null;
  winningBidId: string | null;
  winnerName: string;
  maskedPhone?: string | null;
  validBidCount: number;
  referenceCode: string;
  resultHash: string;
  publishedAt: Date;
};

export type UserRecord = {
  id: string;
  uid: string;
  name: string;
  email: string | null;
  role: "user" | "admin";
  status: "active" | "suspended";
  createdAt: Date;
  lastSignedIn: Date;
};

export type ReportRecord = {
  id: string;
  uid: string;
  reporterName: string;
  reporterEmail: string | null;
  category: "account" | "auction" | "payment" | "safety" | "other";
  subject: string;
  details: string;
  targetType: string | null;
  targetId: string | null;
  status: "open" | "reviewing" | "resolved" | "dismissed";
  adminNotes: string | null;
  createdAt: Date;
};

export type PaymentRecord = {
  id: string;
  uid: string;
  auctionId: string;
  auctionTitle: string;
  amount: number;
  provider: string;
  providerReference: string;
  status: "pending" | "paid" | "failed";
  used: boolean;
  createdAt: Date;
};

export type AuditRecord = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actorUid: string;
  createdAt: Date;
};

export type FirestoreAccountData = {
  profile: AccountProfile;
  bids: BidRecord[];
  savedAuctions: SavedAuction[];
};

const usersCollection = collection(firestore, "users");
const auctionsCollection = collection(firestore, "auctions");
const resultsCollection = collection(firestore, "results");
const userDocument = (uid: string) => doc(firestore, "users", uid);
const userCollection = (uid: string, name: "bids" | "watchlist" | "payments") => collection(userDocument(uid), name);
const toDate = (value: unknown, fallback = new Date()): Date => {
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate();
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
  }
  return fallback;
};
const numberValue = (value: unknown, fallback = 0): number => {
  const parsed = value == null ? fallback : typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const readAuction = (snapshot: QueryDocumentSnapshot<DocumentData>): AuctionRecord => {
  const data = snapshot.data();
  return {
    id: snapshot.id,
    title: String(data.title ?? "Auction"),
    category: String(data.category ?? "Other"),
    imagePath: String(data.imagePath ?? ""),
    sellerName: String(data.sellerName ?? "Tesaka Cherta"),
    bidFee: numberValue(data.bidFee),
    minBid: numberValue(data.minBid, 0.1),
    maxBid: numberValue(data.maxBid, 100),
    maxBidsPerUser: numberValue(data.maxBidsPerUser, 10),
    startsAt: toDate(data.startsAt),
    endsAt: toDate(data.endsAt),
    status: data.status === "draft" || data.status === "closed" ? data.status : "live",
    bidCount: numberValue(data.bidCount),
    createdAt: toDate(data.createdAt),
  };
};

async function writeAudit(actorUid: string, action: string, entityType: string, entityId: string) {
  await addDoc(collection(firestore, "auditLogs"), { actorUid, action, entityType, entityId, createdAt: serverTimestamp() });
}

export async function ensureUserDocument(user: FirebaseUser): Promise<void> {
  const reference = userDocument(user.uid);
  const existing = await getDoc(reference);
  const hasAdminClaim = (await getIdTokenResult(user)).claims.admin === true;
  const profile = {
    uid: user.uid,
    name: user.displayName || user.email?.split("@")[0] || "Tesaka member",
    email: user.email,
    updatedAt: serverTimestamp(),
    lastSignedIn: serverTimestamp(),
  };
  if (existing.exists()) {
    if (existing.data().status === "suspended") return;
    await setDoc(reference, { ...profile, ...(hasAdminClaim ? { role: "admin" } : {}) }, { merge: true });
  } else {
    await setDoc(reference, {
      ...profile,
      phone: user.phoneNumber,
      city: null,
      language: "en",
      marketingOptIn: false,
      role: "user",
      status: "active",
      createdAt: serverTimestamp(),
    });
    if (hasAdminClaim) await setDoc(reference, { role: "admin" }, { merge: true });
  }
}

export async function getAccountData(uid: string): Promise<FirestoreAccountData> {
  const [profileSnapshot, bidsSnapshot, savedSnapshot, resultsSnapshot] = await Promise.all([
    getDoc(userDocument(uid)),
    getDocs(query(userCollection(uid, "bids"), orderBy("createdAt", "desc"))),
    getDocs(query(userCollection(uid, "watchlist"), orderBy("endsAt", "asc"))),
    getDocs(resultsCollection),
  ]);
  const profileData = profileSnapshot.data() ?? {};
  const wins = new Set(resultsSnapshot.docs.map((item) => String(item.data().winningBidId ?? "")));
  const bids: BidRecord[] = bidsSnapshot.docs.map((snapshot) => {
    const data = snapshot.data();
    return {
      id: snapshot.id,
      auctionId: String(data.auctionId ?? ""),
      amount: numberValue(data.amount),
      createdAt: toDate(data.createdAt),
      auctionTitle: String(data.auctionTitle ?? "Auction"),
      auctionImagePath: String(data.auctionImagePath ?? ""),
      auctionStatus: data.auctionStatus === "closed" ? "closed" : "live",
      isWinningBid: wins.has(snapshot.id),
    };
  });
  const savedAuctions: SavedAuction[] = savedSnapshot.docs.map((snapshot) => {
    const data = snapshot.data();
    return { id: snapshot.id, auctionId: String(data.auctionId ?? snapshot.id), title: String(data.title ?? "Auction"), imagePath: String(data.imagePath ?? ""), endsAt: toDate(data.endsAt) };
  });
  return {
    profile: {
      phone: typeof profileData.phone === "string" ? profileData.phone : null,
      city: typeof profileData.city === "string" ? profileData.city : null,
      language: profileData.language === "am" ? "am" : "en",
      marketingOptIn: profileData.marketingOptIn === true,
    },
    bids,
    savedAuctions,
  };
}

export async function saveAccountProfile(uid: string, values: AccountProfile): Promise<void> {
  await setDoc(userDocument(uid), { ...values, updatedAt: serverTimestamp() }, { merge: true });
}

export async function toggleSavedAuction(uid: string, auction: { auctionId: string; title: string; imagePath: string; endsAt: Date }): Promise<boolean> {
  const reference = doc(userCollection(uid, "watchlist"), auction.auctionId);
  const existing = await getDoc(reference);
  if (existing.exists()) {
    await deleteDoc(reference);
    return false;
  }
  await setDoc(reference, { ...auction, createdAt: serverTimestamp() });
  return true;
}

export async function listPublicAuctions(): Promise<AuctionRecord[]> {
  const snapshot = await getDocs(query(auctionsCollection, where("status", "==", "live"), orderBy("endsAt", "asc"), limit(100)));
  return snapshot.docs.map(readAuction).filter((auction) => auction.endsAt.getTime() > Date.now());
}

export async function listPublicResults(): Promise<AuctionResult[]> {
  const snapshot = await getDocs(query(resultsCollection, orderBy("publishedAt", "desc"), limit(30)));
  return snapshot.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      auctionId: String(data.auctionId ?? item.id),
      title: String(data.title ?? "Auction"),
      category: String(data.category ?? "Other"),
      imagePath: String(data.imagePath ?? ""),
      resultType: data.resultType === "winner" ? "winner" : "no_unique_bid",
      winningAmount: data.winningAmount == null ? null : numberValue(data.winningAmount),
      winningBidId: typeof data.winningBidId === "string" ? data.winningBidId : null,
      winnerName: String(data.winnerName ?? "Winner"),
      maskedPhone: typeof data.maskedPhone === "string" ? data.maskedPhone : null,
      validBidCount: numberValue(data.validBidCount),
      referenceCode: String(data.referenceCode ?? ""),
      resultHash: String(data.resultHash ?? ""),
      publishedAt: toDate(data.publishedAt),
    };
  });
}

export async function listAvailablePayments(uid: string, auctionId: string): Promise<PaymentRecord[]> {
  const snapshot = await getDocs(userCollection(uid, "payments"));
  return snapshot.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      uid,
      auctionId: String(data.auctionId ?? ""),
      auctionTitle: String(data.auctionTitle ?? "Auction"),
      amount: numberValue(data.amount),
      provider: String(data.provider ?? "manual"),
      providerReference: String(data.providerReference ?? ""),
      status: data.status === "paid" || data.status === "failed" ? data.status : "pending",
      used: data.used === true,
      createdAt: toDate(data.createdAt),
    };
  }).filter((payment) => payment.auctionId === auctionId && payment.status === "paid" && !payment.used);
}

export async function submitFirestoreBid(uid: string, auctionId: string, paymentId: string, rawAmount: string) {
  const amount = Math.round(Number(rawAmount) * 100) / 100;
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid bid amount.");
  const auctionRef = doc(firestore, "auctions", auctionId);
  const paymentRef = doc(userCollection(uid, "payments"), paymentId);
  const privateBidRef = doc(userCollection(uid, "bids"), paymentId);
  const publicEntryRef = doc(firestore, "auctions", auctionId, "entries", paymentId);
  const counterRef = doc(firestore, "auctions", auctionId, "bidderCounters", uid);
  await runTransaction(firestore, async (transaction) => {
    const [auctionSnapshot, paymentSnapshot, existingBid, existingEntry, counterSnapshot] = await Promise.all([
      transaction.get(auctionRef),
      transaction.get(paymentRef),
      transaction.get(privateBidRef),
      transaction.get(publicEntryRef),
      transaction.get(counterRef),
    ]);
    if (!auctionSnapshot.exists()) throw new Error("Auction not found.");
    const auction = auctionSnapshot.data();
    if (auction.status !== "live" || toDate(auction.startsAt).getTime() > Date.now() || toDate(auction.endsAt).getTime() <= Date.now()) throw new Error("This auction is not accepting bids.");
    if (amount < numberValue(auction.minBid) || amount > numberValue(auction.maxBid)) throw new Error(`Bid must be between ${auction.minBid} and ${auction.maxBid} ETB.`);
    const nextBidCount = numberValue(counterSnapshot.data()?.count) + 1;
    if (nextBidCount > numberValue(auction.maxBidsPerUser, 10)) throw new Error("You have reached this auction's bid limit.");
    if (!paymentSnapshot.exists() || paymentSnapshot.data().status !== "paid" || paymentSnapshot.data().used === true || String(paymentSnapshot.data().auctionId) !== auctionId) throw new Error("A verified, unused payment is required before bidding.");
    if (existingBid.exists() || existingEntry.exists()) throw new Error("This payment has already been used for a bid.");
    transaction.update(paymentRef, { used: true, usedAt: serverTimestamp() });
    transaction.update(auctionRef, { bidCount: numberValue(auction.bidCount) + 1, lastBidId: paymentId, updatedAt: serverTimestamp() });
    transaction.set(counterRef, { uid, count: nextBidCount, lastBidId: paymentId, updatedAt: serverTimestamp() });
    transaction.set(privateBidRef, {
      uid,
      auctionId,
      amount,
      paymentId,
      auctionTitle: String(auction.title ?? "Auction"),
      auctionImagePath: String(auction.imagePath ?? ""),
      auctionStatus: "live",
      createdAt: serverTimestamp(),
    });
    transaction.set(publicEntryRef, { auctionId, amount, createdAt: serverTimestamp() });
  });
  return { id: paymentId, amount };
}

export async function listUserReports(uid: string): Promise<ReportRecord[]> {
  const snapshot = await getDocs(query(collection(firestore, "reports"), where("uid", "==", uid), orderBy("createdAt", "desc"), limit(50)));
  return snapshot.docs.map((item) => ({
    id: item.id,
    uid,
    reporterName: "You",
    reporterEmail: null,
    category: item.data().category,
    subject: String(item.data().subject ?? "Report"),
    details: String(item.data().details ?? ""),
    targetType: typeof item.data().targetType === "string" ? item.data().targetType : null,
    targetId: typeof item.data().targetId === "string" ? item.data().targetId : null,
    status: item.data().status ?? "open",
    adminNotes: null,
    createdAt: toDate(item.data().createdAt),
  }));
}

export async function submitUserReport(uid: string, input: { category: ReportRecord["category"]; subject: string; details: string; targetType?: string | null; targetId?: string | null }) {
  const reference = await addDoc(collection(firestore, "reports"), {
    uid,
    category: input.category,
    subject: input.subject.trim(),
    details: input.details.trim(),
    targetType: input.targetType ?? null,
    targetId: input.targetId ?? null,
    status: "open",
    adminNotes: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return reference.id;
}

export async function listAdminAuctions(): Promise<AuctionRecord[]> {
  const snapshot = await getDocs(query(auctionsCollection, orderBy("createdAt", "desc"), limit(200)));
  return Promise.all(snapshot.docs.map(async (item) => {
    const auction = readAuction(item);
    const countSnapshot = await getCountFromServer(collection(firestore, "auctions", auction.id, "entries"));
    return { ...auction, bidCount: countSnapshot.data().count };
  }));
}

export async function createFirestoreAuction(actorUid: string, input: Omit<AuctionRecord, "id" | "bidCount" | "createdAt">) {
  const title = input.title.trim();
  if (!title || input.endsAt <= input.startsAt || input.bidFee <= 0 || input.minBid <= 0 || input.maxBid < input.minBid) throw new Error("Auction details or limits are invalid.");
  const reference = await addDoc(auctionsCollection, { ...input, title, status: "draft", bidCount: 0, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  await writeAudit(actorUid, "auction.created", "auction", reference.id);
  return reference.id;
}

export async function publishFirestoreAuction(actorUid: string, auctionId: string) {
  const reference = doc(auctionsCollection, auctionId);
  const snapshot = await getDoc(reference);
  if (!snapshot.exists()) throw new Error("Auction not found.");
  if (snapshot.data().status === "closed") throw new Error("Closed auctions cannot be published again.");
  if (toDate(snapshot.data().endsAt).getTime() <= Date.now()) throw new Error("Auction end time must be in the future.");
  await updateDoc(reference, { status: "live", updatedAt: serverTimestamp() });
  await writeAudit(actorUid, "auction.published", "auction", auctionId);
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function closeFirestoreAuction(actorUid: string, auctionId: string) {
  const auctionRef = doc(auctionsCollection, auctionId);
  const auctionSnapshot = await getDoc(auctionRef);
  if (!auctionSnapshot.exists()) throw new Error("Auction not found.");
  const auction = auctionSnapshot.data();
  if (auction.status !== "live") throw new Error("Only a live auction can be closed.");
  if (toDate(auction.endsAt).getTime() > Date.now()) throw new Error("An auction can only be finalized after its scheduled end time.");
  const entrySnapshot = await getDocs(collection(firestore, "auctions", auctionId, "entries"));
  const entries = entrySnapshot.docs.map((item) => ({ id: item.id, amount: numberValue(item.data().amount) })).sort((a, b) => a.id.localeCompare(b.id));
  const winningBid = calculateLowestUniqueBid(entries);
  const winner = winningBid ? entries.find((entry) => entry.id === winningBid.id) : undefined;
  const canonical = entries.map((entry) => `${entry.id}:${amountToCents(entry.amount)}`).join("|");
  const resultHash = await sha256(`${auctionId}|${canonical}`);
  const referenceCode = `CH-${auctionId.slice(0, 8).toUpperCase()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const resultRef = doc(resultsCollection, auctionId);
  const batch = writeBatch(firestore);
  batch.update(auctionRef, { status: "closed", updatedAt: serverTimestamp() });
  batch.set(resultRef, {
    auctionId,
    title: String(auction.title ?? "Auction"),
    category: String(auction.category ?? "Other"),
    imagePath: String(auction.imagePath ?? ""),
    resultType: winner ? "winner" : "no_unique_bid",
    winningBidId: winner?.id ?? null,
    winningAmount: winner?.amount ?? null,
    winnerName: winner ? "Winner" : "No winner declared",
    validBidCount: entries.length,
    referenceCode,
    resultHash,
    publishedAt: serverTimestamp(),
  });
  batch.set(doc(collection(firestore, "auditLogs")), { actorUid, action: "auction.result_published", entityType: "auction", entityId: auctionId, createdAt: serverTimestamp(), resultHash, referenceCode });
  await batch.commit();
  return { resultType: winner ? "winner" as const : "no_unique_bid" as const, referenceCode, winningAmount: winner?.amount ?? null, validBidCount: entries.length };
}

export async function listAdminUsers(): Promise<UserRecord[]> {
  const snapshot = await getDocs(query(usersCollection, limit(200)));
  return snapshot.docs.map((item) => {
    const data = item.data();
    return {
      id: item.id,
      uid: item.id,
      name: String(data.name ?? "Cherta member"),
      email: typeof data.email === "string" ? data.email : null,
      role: data.role === "admin" ? "admin" as const : "user" as const,
      status: data.status === "suspended" ? "suspended" as const : "active" as const,
      createdAt: toDate(data.createdAt),
      lastSignedIn: toDate(data.lastSignedIn ?? data.updatedAt),
    };
  }).sort((left, right) => right.lastSignedIn.getTime() - left.lastSignedIn.getTime());
}

export async function updateFirestoreUserStatus(actorUid: string, targetUid: string, status: "active" | "suspended") {
  if (actorUid === targetUid) throw new Error("You cannot change your own account status.");
  const reference = userDocument(targetUid);
  const target = await getDoc(reference);
  if (!target.exists()) throw new Error("User not found.");
  if (target.data().role === "admin") throw new Error("Administrator accounts cannot be suspended from this screen.");
  await updateDoc(reference, { status, updatedAt: serverTimestamp() });
  await writeAudit(actorUid, status === "suspended" ? "user.suspended" : "user.reactivated", "user", targetUid);
}

export async function listAdminReports(): Promise<ReportRecord[]> {
  const snapshot = await getDocs(query(collection(firestore, "reports"), orderBy("createdAt", "desc"), limit(200)));
  const users = new Map<string, DocumentData>();
  await Promise.all(snapshot.docs.map(async (item) => {
    const uid = String(item.data().uid ?? "");
    if (uid && !users.has(uid)) {
      const userSnapshot = await getDoc(userDocument(uid));
      if (userSnapshot.exists()) users.set(uid, userSnapshot.data());
    }
  }));
  return snapshot.docs.map((item) => {
    const data = item.data();
    const reporter = users.get(String(data.uid ?? ""));
    return {
      id: item.id,
      uid: String(data.uid ?? ""),
      reporterName: String(reporter?.name ?? "Cherta member"),
      reporterEmail: typeof reporter?.email === "string" ? reporter.email : null,
      category: data.category ?? "other",
      subject: String(data.subject ?? "Report"),
      details: String(data.details ?? ""),
      targetType: typeof data.targetType === "string" ? data.targetType : null,
      targetId: typeof data.targetId === "string" ? data.targetId : null,
      status: data.status ?? "open",
      adminNotes: typeof data.adminNotes === "string" ? data.adminNotes : null,
      createdAt: toDate(data.createdAt),
    };
  });
}

export async function reviewFirestoreReport(actorUid: string, reportId: string, status: ReportRecord["status"], adminNotes: string | null) {
  await updateDoc(doc(firestore, "reports", reportId), { status, adminNotes, updatedAt: serverTimestamp(), reviewedBy: actorUid });
  await writeAudit(actorUid, "report.review_updated", "report", reportId);
}

export async function listAdminPayments(): Promise<PaymentRecord[]> {
  const snapshot = await getDocs(query(collectionGroup(firestore, "payments"), orderBy("createdAt", "desc"), limit(200)));
  return Promise.all(snapshot.docs.map(async (item) => {
    const data = item.data();
    const uid = item.ref.parent.parent?.id ?? String(data.uid ?? "");
    return {
      id: item.id,
      uid,
      auctionId: String(data.auctionId ?? ""),
      auctionTitle: String(data.auctionTitle ?? "Auction"),
      amount: numberValue(data.amount),
      provider: String(data.provider ?? "manual"),
      providerReference: String(data.providerReference ?? ""),
      status: data.status === "paid" || data.status === "failed" ? data.status : "pending",
      used: data.used === true,
      createdAt: toDate(data.createdAt),
    };
  }));
}

export async function createManualPaymentRecord(actorUid: string, input: { uid: string; auctionId: string; providerReference: string; status: "pending" | "paid" }) {
  const [userSnapshot, auctionSnapshot] = await Promise.all([getDoc(userDocument(input.uid)), getDoc(doc(auctionsCollection, input.auctionId))]);
  if (!userSnapshot.exists() || !auctionSnapshot.exists()) throw new Error("Choose an existing user and auction.");
  const auction = auctionSnapshot.data();
  const paymentRef = doc(userCollection(input.uid, "payments"));
  await setDoc(paymentRef, {
    uid: input.uid,
    auctionId: input.auctionId,
    auctionTitle: String(auction.title ?? "Auction"),
    amount: numberValue(auction.bidFee),
    provider: "manual",
    providerReference: input.providerReference.trim(),
    status: input.status,
    used: false,
    createdAt: serverTimestamp(),
    createdBy: actorUid,
  });
  await writeAudit(actorUid, "payment.manual_recorded", "payment", paymentRef.id);
}

export async function listAdminAudit(): Promise<AuditRecord[]> {
  const snapshot = await getDocs(query(collection(firestore, "auditLogs"), orderBy("createdAt", "desc"), limit(100)));
  return snapshot.docs.map((item) => ({
    id: item.id,
    action: String(item.data().action ?? "activity"),
    entityType: String(item.data().entityType ?? "record"),
    entityId: String(item.data().entityId ?? ""),
    actorUid: String(item.data().actorUid ?? "system"),
    createdAt: toDate(item.data().createdAt),
  }));
}

export async function getAdminDashboardStats() {
  const [users, auctions, reports, payments, bids, results] = await Promise.all([
    getDocs(usersCollection),
    getDocs(auctionsCollection),
    getDocs(collection(firestore, "reports")),
    getDocs(collectionGroup(firestore, "payments")),
    getDocs(collectionGroup(firestore, "bids")),
    getDocs(resultsCollection),
  ]);
  return {
    totalUsers: users.size,
    activeUsers: users.docs.filter((item) => item.data().status !== "suspended").length,
    liveAuctions: auctions.docs.filter((item) => item.data().status === "live").length,
    completedAuctions: results.size,
    totalBids: bids.size,
    paymentOrders: payments.size,
    winners: results.docs.filter((item) => item.data().resultType === "winner").length,
    openReports: reports.docs.filter((item) => item.data().status === "open").length,
  };
}
