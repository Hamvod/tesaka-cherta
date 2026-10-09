import { getIdTokenResult, type User as FirebaseUser } from "firebase/auth";
import {
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from "firebase/firestore";
import { firestore } from "./firebase";
import {
  createAuctionCall,
  closeAuctionForEditingCall,
  deleteAuctionCall,
  finalizeAuctionCall,
  placeBidCall,
  publishAuctionCall,
  recordManualPaymentCall,
  requestOwnerAccessCall,
  reviewPaymentProofCall,
  reviewAuctionCall,
  reviewOwnerApplicationCall,
  reviewReportCall,
  setUserStatusCall,
  submitAuctionForReviewCall,
  submitPaymentProofCall,
  submitSupportReportCall,
  type CreateAuctionInput,
  updateAuctionCall,
  type UpdateAuctionInput,
} from "./cloudFunctions";

export type AccountProfile = { phone: string | null; city: string | null; language: "en" | "am"; marketingOptIn: boolean };
export type SavedAuction = { id: string; auctionId: string; title: string; imagePath: string; endsAt: Date };
export type AuctionStatus = "draft" | "pending_review" | "rejected" | "published" | "live" | "calculating" | "completed" | "closed";
export type AuctionRecord = {
  id: string;
  title: string;
  description?: string;
  category: string;
  imagePath: string;
  productId?: string;
  ownerUid?: string;
  ownerName?: string;
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
  role: "user" | "owner" | "admin";
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
  adminReply: string | null;
  createdAt: Date;
};
export type PaymentRecord = { id: string; uid: string; auctionId: string; auctionTitle: string; amount: number; provider: string; providerReference: string; status: "pending" | "paid" | "failed"; used: boolean; createdAt: Date; source: "manual" | "bidder_proof"; hasReceiptImage: boolean; ocrText: string | null; ocrStatusHint: "success_terms" | "failure_terms" | "unclear" | null; verificationNote: string | null };
export type AuditRecord = { id: string; action: string; entityType: string; entityId: string; actorUid: string; createdAt: Date };
export type NotificationRecord = { id: string; type: string; titleKey: string; bodyKey: string; params: Record<string, string>; createdAt: Date; readAt: Date | null };
export type DeviceRecord = { id: string; label: string; userAgent: string; firstSeen: Date; lastSeen: Date; current: boolean };
export type OwnerApplicationRecord = { uid: string; businessName: string; city: string; contactPhone: string; description: string; status: "pending" | "approved" | "rejected"; submittedAt: Date; reviewNote: string | null; applicantName: string; applicantEmail: string | null };
export type OwnerWinRecord = { id: string; auctionId: string; bidId: string; amount: number; title: string; imagePath: string; referenceCode: string; createdAt: Date };
export type FirestoreAccountData = { profile: AccountProfile; bids: BidRecord[]; savedAuctions: SavedAuction[]; wins: OwnerWinRecord[]; notifications: NotificationRecord[]; devices: DeviceRecord[] };

const usersCollection = collection(firestore, "users");
const auctionsCollection = collection(firestore, "auctions");
const resultsCollection = collection(firestore, "results");
const userDocument = (uid: string) => doc(firestore, "users", uid);
const userCollection = (uid: string, name: "bids" | "watchlist" | "payments" | "wins" | "notifications" | "devices") => collection(userDocument(uid), name);
const toDate = (value: unknown, fallback = new Date()): Date => {
  if (value instanceof Date) return value;
  if (value instanceof Timestamp) return value.toDate();
  if (value && typeof value === "object" && "toDate" in value && typeof value.toDate === "function") return value.toDate();
  if (typeof value === "string" || typeof value === "number") { const result = new Date(value); if (!Number.isNaN(result.getTime())) return result; }
  return fallback;
};
const numberValue = (value: unknown, fallback = 0): number => {
  const parsed = value == null ? fallback : typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const asAuctionStatus = (value: unknown): AuctionStatus => {
  const allowed: AuctionStatus[] = ["draft", "pending_review", "rejected", "published", "live", "calculating", "completed", "closed"];
  return allowed.includes(value as AuctionStatus) ? value as AuctionStatus : "draft";
};
const readAuction = (snapshot: QueryDocumentSnapshot<DocumentData>): AuctionRecord => {
  const data = snapshot.data();
  return {
    id: snapshot.id, title: String(data.title ?? "Auction"), description: typeof data.description === "string" ? data.description : "",
    category: String(data.category ?? "Other"), imagePath: String(data.imagePath ?? ""),
    productId: String(data.productId ?? snapshot.id), ownerUid: typeof data.ownerUid === "string" ? data.ownerUid : undefined,
    ownerName: typeof data.ownerName === "string" ? data.ownerName : undefined, sellerName: String(data.sellerName ?? "Tesaka Cherta"),
    bidFee: numberValue(data.bidFee), minBid: numberValue(data.minBid, 0.1), maxBid: numberValue(data.maxBid, 100),
    maxBidsPerUser: numberValue(data.maxBidsPerUser, 10), startsAt: toDate(data.startsAt), endsAt: toDate(data.endsAt),
    status: asAuctionStatus(data.status), bidCount: numberValue(data.bidCount), createdAt: toDate(data.createdAt),
  };
};
const readNotification = (item: QueryDocumentSnapshot<DocumentData>): NotificationRecord => ({
  id: item.id, type: String(item.data().type ?? "notice"), titleKey: String(item.data().titleKey ?? "notice.default.title"),
  bodyKey: String(item.data().bodyKey ?? "notice.default.body"),
  params: item.data().params && typeof item.data().params === "object" ? item.data().params as Record<string, string> : {},
  createdAt: toDate(item.data().createdAt), readAt: item.data().readAt ? toDate(item.data().readAt) : null,
});

export async function ensureUserDocument(user: FirebaseUser): Promise<void> {
  const reference = userDocument(user.uid);
  const [existing, token] = await Promise.all([getDoc(reference), getIdTokenResult(user)]);
  const hasAdminClaim = token.claims.admin === true;
  const hasOwnerClaim = token.claims.owner === true;
  const profile = { uid: user.uid, name: user.displayName || user.email?.split("@")[0] || "Tesaka member", email: user.email, updatedAt: serverTimestamp(), lastSignedIn: serverTimestamp() };
  if (existing.exists()) {
    if (existing.data().status === "suspended") return;
    await setDoc(reference, { ...profile, ...(hasAdminClaim ? { role: "admin" } : hasOwnerClaim ? { role: "owner", ownerStatus: "approved" } : {}) }, { merge: true });
  } else {
    await setDoc(reference, {
      ...profile, phone: user.phoneNumber, city: null, language: "en", marketingOptIn: false,
      role: hasAdminClaim ? "admin" : hasOwnerClaim ? "owner" : "user", ownerStatus: hasOwnerClaim ? "approved" : "none",
      ownerApplicationStatus: "none", status: "active", createdAt: serverTimestamp(),
    });
  }
}

export async function getAccountData(uid: string): Promise<FirestoreAccountData> {
  const [profileSnapshot, bidsSnapshot, savedSnapshot, winsSnapshot, notificationsSnapshot, devicesSnapshot] = await Promise.all([
    getDoc(userDocument(uid)), getDocs(query(userCollection(uid, "bids"), orderBy("createdAt", "desc"), limit(100))),
    getDocs(query(userCollection(uid, "watchlist"), orderBy("endsAt", "asc"), limit(100))),
    getDocs(query(userCollection(uid, "wins"), orderBy("createdAt", "desc"), limit(50))),
    getDocs(query(userCollection(uid, "notifications"), orderBy("createdAt", "desc"), limit(50))),
    getDocs(query(userCollection(uid, "devices"), orderBy("lastSeen", "desc"), limit(50))),
  ]);
  const profileData = profileSnapshot.data() ?? {};
  const bids: BidRecord[] = bidsSnapshot.docs.map((snapshot) => {
    const data = snapshot.data();
    return { id: snapshot.id, auctionId: String(data.auctionId ?? ""), amount: numberValue(data.amount), createdAt: toDate(data.createdAt), auctionTitle: String(data.auctionTitle ?? "Auction"), auctionImagePath: String(data.auctionImagePath ?? ""), auctionStatus: asAuctionStatus(data.auctionStatus), isWinningBid: data.isWinningBid === true };
  });
  const savedAuctions: SavedAuction[] = savedSnapshot.docs.map((snapshot) => {
    const data = snapshot.data(); return { id: snapshot.id, auctionId: String(data.auctionId ?? snapshot.id), title: String(data.title ?? "Auction"), imagePath: String(data.imagePath ?? ""), endsAt: toDate(data.endsAt) };
  });
  const wins: OwnerWinRecord[] = winsSnapshot.docs.map((item) => ({ id: item.id, auctionId: String(item.data().auctionId ?? item.id), bidId: String(item.data().bidId ?? ""), amount: numberValue(item.data().amount), title: String(item.data().title ?? "Auction"), imagePath: String(item.data().imagePath ?? ""), referenceCode: String(item.data().referenceCode ?? ""), createdAt: toDate(item.data().createdAt) }));
  const localDeviceId = localStorage.getItem(`cherta-device-${uid}`);
  const devices: DeviceRecord[] = devicesSnapshot.docs.map((item) => ({ id: item.id, label: String(item.data().label ?? "Device"), userAgent: String(item.data().userAgent ?? ""), firstSeen: toDate(item.data().firstSeen), lastSeen: toDate(item.data().lastSeen), current: item.id === localDeviceId }));
  return {
    profile: { phone: typeof profileData.phone === "string" ? profileData.phone : null, city: typeof profileData.city === "string" ? profileData.city : null, language: profileData.language === "am" ? "am" : "en", marketingOptIn: profileData.marketingOptIn === true },
    bids, savedAuctions, wins, notifications: notificationsSnapshot.docs.map(readNotification), devices,
  };
}

export async function saveAccountProfile(uid: string, values: AccountProfile): Promise<void> {
  await setDoc(userDocument(uid), { ...values, updatedAt: serverTimestamp() }, { merge: true });
}

export async function toggleSavedAuction(uid: string, auction: { auctionId: string; title: string; imagePath: string; endsAt: Date }): Promise<boolean> {
  const reference = doc(userCollection(uid, "watchlist"), auction.auctionId);
  const existing = await getDoc(reference);
  if (existing.exists()) { await deleteDoc(reference); return false; }
  await setDoc(reference, { ...auction, createdAt: serverTimestamp() });
  return true;
}

export async function listPublicAuctions(): Promise<AuctionRecord[]> {
  const snapshot = await getDocs(query(auctionsCollection, where("status", "in", ["live", "published"])));
  return snapshot.docs.map(readAuction)
    .filter((auction) => auction.endsAt.getTime() > Date.now())
    .sort((left, right) => left.endsAt.getTime() - right.endsAt.getTime())
    .slice(0, 100);
}

export async function getPublicAuction(auctionId: string): Promise<AuctionRecord | null> {
  const snapshot = await getDoc(doc(auctionsCollection, auctionId));
  if (!snapshot.exists() || !["live", "published", "completed"].includes(String(snapshot.get("status")))) return null;
  return readAuction(snapshot as QueryDocumentSnapshot<DocumentData>);
}

export async function listPublicResults(): Promise<AuctionResult[]> {
  const snapshot = await getDocs(query(resultsCollection, orderBy("publishedAt", "desc"), limit(100)));
  return snapshot.docs.map((item) => ({
    id: item.id, auctionId: String(item.data().auctionId ?? item.id), title: String(item.data().title ?? "Auction"),
    category: String(item.data().category ?? "Other"), imagePath: String(item.data().imagePath ?? ""),
    resultType: item.data().resultType === "winner" ? "winner" : "no_unique_bid",
    winningAmount: item.data().winningAmount == null ? null : numberValue(item.data().winningAmount),
    winnerName: String(item.data().winnerName ?? "Winner"), maskedPhone: typeof item.data().maskedPhone === "string" ? item.data().maskedPhone : null,
    validBidCount: numberValue(item.data().validBidCount), referenceCode: String(item.data().referenceCode ?? ""),
    resultHash: String(item.data().resultHash ?? ""), publishedAt: toDate(item.data().publishedAt),
  }));
}

function readPaymentRecord(id: string, uid: string, data: DocumentData): PaymentRecord {
  const hint = data.ocrStatusHint;
  return {
    id, uid, auctionId: String(data.auctionId ?? ""), auctionTitle: String(data.auctionTitle ?? "Auction"),
    amount: numberValue(data.amount), provider: String(data.provider ?? "manual"), providerReference: String(data.providerReference ?? ""),
    status: data.status === "paid" || data.status === "failed" ? data.status : "pending", used: data.used === true, createdAt: toDate(data.createdAt),
    source: data.source === "bidder_proof" ? "bidder_proof" : "manual",
    hasReceiptImage: data.hasReceiptImage === true,
    ocrText: typeof data.ocrText === "string" ? data.ocrText : null,
    ocrStatusHint: hint === "success_terms" || hint === "failure_terms" || hint === "unclear" ? hint : null,
    verificationNote: typeof data.verificationNote === "string" ? data.verificationNote : null,
  };
}

export async function listUserPayments(uid: string): Promise<PaymentRecord[]> {
  const snapshot = await getDocs(query(userCollection(uid, "payments"), orderBy("createdAt", "desc"), limit(100)));
  return snapshot.docs.map((item) => readPaymentRecord(item.id, uid, item.data()));
}

export async function listAvailablePayments(uid: string, auctionId: string): Promise<PaymentRecord[]> {
  const records = await listUserPayments(uid);
  return records.filter((payment) => payment.auctionId === auctionId && payment.status === "paid" && !payment.used);
}

export async function submitUserPaymentProof(input: { auctionId: string; provider: string; providerReference?: string; proofImageDataUrl?: string; ocrText?: string }) {
  return submitPaymentProofCall(input);
}

export async function reviewUserPaymentProof(input: { uid: string; paymentId: string; decision: "paid" | "failed"; note?: string }) {
  return reviewPaymentProofCall(input);
}

export async function submitFirestoreBid(_uid: string, auctionId: string, paymentId: string, rawAmount: string) {
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter a valid bid amount.");
  return placeBidCall({ auctionId, amount, ...(paymentId ? { paymentId } : {}) });
}

export async function listUserReports(uid: string): Promise<ReportRecord[]> {
  const snapshot = await getDocs(query(collection(firestore, "reports"), where("uid", "==", uid)));
  return snapshot.docs.map((item) => ({ id: item.id, uid, reporterName: "You", reporterEmail: null, category: item.data().category,
    subject: String(item.data().subject ?? "Report"), details: String(item.data().details ?? ""),
    targetType: typeof item.data().targetType === "string" ? item.data().targetType : null,
    targetId: typeof item.data().targetId === "string" ? item.data().targetId : null,
    status: item.data().status ?? "open", adminNotes: null, adminReply: typeof item.data().adminReply === "string" ? item.data().adminReply : null,
    createdAt: toDate(item.data().createdAt),
  })).sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()).slice(0, 50);
}

export async function submitUserReport(_uid: string, input: { category: ReportRecord["category"]; subject: string; details: string; targetType?: string | null; targetId?: string | null }) {
  return submitSupportReportCall(input);
}

export async function listAdminAuctions(): Promise<AuctionRecord[]> {
  const snapshot = await getDocs(query(auctionsCollection, orderBy("createdAt", "desc"), limit(200)));
  return Promise.all(snapshot.docs.map(async (item) => {
    const auction = readAuction(item);
    const countSnapshot = await getCountFromServer(collection(firestore, "auctions", auction.id, "entries"));
    return { ...auction, bidCount: countSnapshot.data().count };
  }));
}

export async function listOwnerAuctions(uid: string): Promise<AuctionRecord[]> {
  const snapshot = await getDocs(query(auctionsCollection, where("ownerUid", "==", uid)));
  return snapshot.docs.map(readAuction).sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime()).slice(0, 100);
}

export async function createFirestoreAuction(_actorUid: string, input: Omit<AuctionRecord, "id" | "bidCount" | "createdAt" | "status" | "imagePath"> & { description: string; imageDataUrl: string }) {
  const request: CreateAuctionInput = {
    title: input.title, category: input.category, description: input.description, sellerName: input.sellerName,
    imageDataUrl: input.imageDataUrl, bidFee: input.bidFee,
    minBid: input.minBid, maxBid: input.maxBid, maxBidsPerUser: input.maxBidsPerUser,
    startsAtMs: input.startsAt.getTime(), endsAtMs: input.endsAt.getTime(),
  };
  return createAuctionCall(request);
}

export async function updateFirestoreAuction(_actorUid: string, auctionId: string, input: Omit<AuctionRecord, "id" | "bidCount" | "createdAt" | "status" | "imagePath"> & { description: string; imageDataUrl?: string }) {
  const request: UpdateAuctionInput = {
    auctionId, title: input.title, category: input.category, description: input.description, sellerName: input.sellerName,
    bidFee: input.bidFee, minBid: input.minBid, maxBid: input.maxBid, maxBidsPerUser: input.maxBidsPerUser,
    startsAtMs: input.startsAt.getTime(), endsAtMs: input.endsAt.getTime(),
    ...(input.imageDataUrl ? { imageDataUrl: input.imageDataUrl } : {}),
  };
  return updateAuctionCall(request);
}

export async function deleteFirestoreAuction(_actorUid: string, auctionId: string) {
  return deleteAuctionCall({ auctionId });
}

export async function submitAuctionReview(_actorUid: string, auctionId: string) { return submitAuctionForReviewCall({ auctionId }); }
export async function reviewAuctionListing(auctionId: string, decision: "approve" | "reject", note = "") { return reviewAuctionCall({ auctionId, decision, note }); }
export async function publishFirestoreAuction(_actorUid: string, auctionId: string) { return publishAuctionCall({ auctionId }); }
export async function closeAuctionForEditing(_actorUid: string, auctionId: string) { return closeAuctionForEditingCall({ auctionId }); }
export async function closeFirestoreAuction(_actorUid: string, auctionId: string) { return finalizeAuctionCall({ auctionId }); }

export async function listAdminUsers(): Promise<UserRecord[]> {
  const snapshot = await getDocs(query(usersCollection, limit(500)));
  return snapshot.docs.map((item) => {
    const data = item.data();
    return { id: item.id, uid: item.id, name: String(data.name ?? "Cherta member"), email: typeof data.email === "string" ? data.email : null,
      role: (data.role === "admin" ? "admin" : data.role === "owner" ? "owner" : "user") as UserRecord["role"], status: (data.status === "suspended" ? "suspended" : "active") as UserRecord["status"],
      createdAt: toDate(data.createdAt), lastSignedIn: toDate(data.lastSignedIn ?? data.updatedAt),
    };
  }).sort((left, right) => right.lastSignedIn.getTime() - left.lastSignedIn.getTime());
}

export async function updateFirestoreUserStatus(_actorUid: string, targetUid: string, status: "active" | "suspended") { return setUserStatusCall({ uid: targetUid, status }); }

export async function listAdminReports(): Promise<ReportRecord[]> {
  const snapshot = await getDocs(query(collection(firestore, "reports"), orderBy("createdAt", "desc"), limit(200)));
  const users = new Map<string, DocumentData>();
  const privateReviews = new Map<string, DocumentData>();
  await Promise.all(snapshot.docs.map(async (item) => {
    const uid = String(item.data().uid ?? "");
    const [profileSnapshot, reviewSnapshot] = await Promise.all([
      uid ? getDoc(userDocument(uid)) : Promise.resolve(null),
      getDoc(doc(firestore, "reports", item.id, "private", "review")),
    ]);
    if (profileSnapshot?.exists()) users.set(uid, profileSnapshot.data());
    if (reviewSnapshot.exists()) privateReviews.set(item.id, reviewSnapshot.data());
  }));
  return snapshot.docs.map((item) => {
    const data = item.data(); const uid = String(data.uid ?? ""); const reporter = users.get(uid);
    return { id: item.id, uid, reporterName: String(reporter?.name ?? "Cherta member"), reporterEmail: typeof reporter?.email === "string" ? reporter.email : null,
      category: data.category ?? "other", subject: String(data.subject ?? "Report"), details: String(data.details ?? ""),
      targetType: typeof data.targetType === "string" ? data.targetType : null, targetId: typeof data.targetId === "string" ? data.targetId : null,
      status: data.status ?? "open", adminNotes: typeof privateReviews.get(item.id)?.adminNotes === "string" ? privateReviews.get(item.id)!.adminNotes : null,
      adminReply: typeof data.adminReply === "string" ? data.adminReply : null, createdAt: toDate(data.createdAt),
    };
  });
}

export async function reviewFirestoreReport(_actorUid: string, reportId: string, status: ReportRecord["status"], adminNotes: string | null, adminReply: string | null = null) {
  return reviewReportCall({ reportId, status, adminNotes, adminReply });
}

export async function listAdminPayments(): Promise<PaymentRecord[]> {
  const users = await getDocs(usersCollection);
  const snapshots = await getUserSubcollectionSnapshots(users.docs, "payments", 200);
  return snapshots.flatMap((snapshot) => snapshot.docs.map((item) => readPaymentRecord(item.id, item.ref.parent.parent?.id ?? String(item.data().uid ?? ""), item.data())))
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
    .slice(0, 200);
}

export async function createManualPaymentRecord(_actorUid: string, input: { uid: string; auctionId: string; providerReference: string; status: "pending" | "paid" }) {
  return recordManualPaymentCall(input);
}

export async function listAdminOwnerApplications(): Promise<OwnerApplicationRecord[]> {
  const snapshot = await getDocs(query(collection(firestore, "ownerApplications"), orderBy("submittedAt", "desc"), limit(200)));
  const users = await Promise.all(snapshot.docs.map((item) => getDoc(userDocument(item.id))));
  return snapshot.docs.map((item, index) => ({ uid: item.id, businessName: String(item.data().businessName ?? "Seller"), city: String(item.data().city ?? ""),
    contactPhone: String(item.data().contactPhone ?? ""), description: String(item.data().description ?? ""),
    status: item.data().status === "approved" || item.data().status === "rejected" ? item.data().status : "pending",
    submittedAt: toDate(item.data().submittedAt), reviewNote: typeof item.data().reviewNote === "string" ? item.data().reviewNote : null,
    applicantName: String(users[index]?.data()?.name ?? "Cherta member"), applicantEmail: typeof users[index]?.data()?.email === "string" ? users[index]!.data()!.email : null,
  }));
}

async function getUserSubcollectionSnapshots(users: readonly QueryDocumentSnapshot<DocumentData>[], subcollectionName: "payments" | "bids", perUserLimit?: number) {
  const snapshots: QuerySnapshot<DocumentData>[] = [];
  for (let offset = 0; offset < users.length; offset += 20) {
    const batch = users.slice(offset, offset + 20);
    snapshots.push(...await Promise.all(batch.map((user) => {
      const userRecords = collection(firestore, "users", user.id, subcollectionName);
      return perUserLimit ? getDocs(query(userRecords, orderBy("createdAt", "desc"), limit(perUserLimit))) : getDocs(userRecords);
    })));
  }
  return snapshots;
}

export async function reviewOwner(uid: string, decision: "approve" | "reject", note = "") { return reviewOwnerApplicationCall({ uid, decision, note }); }
export async function requestOwnerApplication(input: { businessName: string; city: string; contactPhone: string; description: string }) { return requestOwnerAccessCall(input); }

export async function getOwnerApplication(uid: string) {
  const [application, profile] = await Promise.all([getDoc(doc(firestore, "ownerApplications", uid)), getDoc(userDocument(uid))]);
  return { status: String(application.data()?.status ?? profile.data()?.ownerApplicationStatus ?? "none"), note: typeof application.data()?.reviewNote === "string" ? application.data()!.reviewNote as string : null };
}

export async function listUserNotifications(uid: string): Promise<NotificationRecord[]> {
  const snapshot = await getDocs(query(userCollection(uid, "notifications"), orderBy("createdAt", "desc"), limit(50)));
  return snapshot.docs.map(readNotification);
}

export async function markNotificationRead(uid: string, notificationId: string) {
  await updateDoc(doc(userCollection(uid, "notifications"), notificationId), { readAt: serverTimestamp() });
}

export async function registerCurrentDevice(uid: string): Promise<void> {
  const key = `cherta-device-${uid}`;
  const existing = localStorage.getItem(key);
  const deviceId = existing || crypto.randomUUID();
  localStorage.setItem(key, deviceId);
  const userAgent = navigator.userAgent.slice(0, 500);
  const label = /Android/i.test(userAgent) ? "Android device" : /iPhone|iPad/i.test(userAgent) ? "Apple mobile device" : /Windows/i.test(userAgent) ? "Windows browser" : /Mac/i.test(userAgent) ? "Mac browser" : "Web browser";
  const ref = doc(userCollection(uid, "devices"), deviceId);
  const current = await getDoc(ref);
  await setDoc(ref, { label, userAgent, current: true, lastSeen: serverTimestamp(), ...(current.exists() ? {} : { firstSeen: serverTimestamp() }) }, { merge: true });
}

export async function removeUserDevice(uid: string, deviceId: string) { await deleteDoc(doc(userCollection(uid, "devices"), deviceId)); }

export async function listAdminAudit(): Promise<AuditRecord[]> {
  const snapshot = await getDocs(query(collection(firestore, "auditLogs"), orderBy("createdAt", "desc"), limit(100)));
  return snapshot.docs.map((item) => ({ id: item.id, action: String(item.data().action ?? "activity"), entityType: String(item.data().entityType ?? "record"), entityId: String(item.data().entityId ?? ""), actorUid: String(item.data().actorUid ?? "system"), createdAt: toDate(item.data().createdAt) }));
}

export async function getAdminDashboardStats() {
  const [users, auctions, reports, results, ownerApplications] = await Promise.all([
    getDocs(usersCollection), getDocs(auctionsCollection), getDocs(collection(firestore, "reports")),
    getDocs(resultsCollection), getDocs(collection(firestore, "ownerApplications")),
  ]);
  const [paymentSnapshots, bidSnapshots] = await Promise.all([
    getUserSubcollectionSnapshots(users.docs, "payments"), getUserSubcollectionSnapshots(users.docs, "bids"),
  ]);
  const paymentCount = paymentSnapshots.reduce((total, snapshot) => total + snapshot.size, 0);
  const bidCount = bidSnapshots.reduce((total, snapshot) => total + snapshot.size, 0);
  return { totalUsers: users.size, activeUsers: users.docs.filter((item) => item.data().status !== "suspended").length,
    liveAuctions: auctions.docs.filter((item) => item.data().status === "live").length, completedAuctions: results.size,
    totalBids: bidCount, paymentOrders: paymentCount, winners: results.docs.filter((item) => item.data().resultType === "winner").length,
    openReports: reports.docs.filter((item) => item.data().status === "open").length,
    pendingOwners: ownerApplications.docs.filter((item) => item.data().status === "pending").length,
  };
}
