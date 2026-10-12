import assert from "node:assert/strict";
import { initializeApp as initializeAdminApp, deleteApp as deleteAdminApp } from "firebase-admin/app";
import { getAuth as getAdminAuth } from "firebase-admin/auth";
import { getFirestore as getAdminFirestore, Timestamp as AdminTimestamp } from "firebase-admin/firestore";
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";
import { publishFirestoreAuctionResult } from "../../client/src/lib/firestoreResults";

process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
const projectId = process.env.GCLOUD_PROJECT || "demo-tesaka-cherta";
const suffix = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
const adminApp = initializeAdminApp({ projectId }, `winner-publish-admin-${suffix}`);
const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminFirestore(adminApp);
const clientApps: ReturnType<typeof initializeApp>[] = [];

async function createEmulatorUser(email: string, name: string, claims: Record<string, boolean> = {}) {
  const user = await adminAuth.createUser({ email, password: "local-only-emulator-password", displayName: name });
  await adminAuth.setCustomUserClaims(user.uid, claims);
  await adminDb.doc(`users/${user.uid}`).set({ uid: user.uid, name, email, role: claims.admin ? "admin" : "user", status: "active", phone: "+251911123456" });
  return user;
}

async function createWebClient(name: string, email: string): Promise<{ app: ReturnType<typeof initializeApp>; db: Firestore; uid: string }> {
  const app = initializeApp({ apiKey: "fake-api-key", authDomain: `${projectId}.firebaseapp.com`, projectId }, name);
  clientApps.push(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  const credential = await signInWithEmailAndPassword(auth, email, "local-only-emulator-password");
  await credential.user.getIdToken(true);
  return { app, db, uid: credential.user.uid };
}

async function seedAuction(auctionId: string, status: "live" | "published", bidCount: number) {
  await adminDb.doc(`auctions/${auctionId}`).set({
    ownerUid: "synthetic-owner",
    title: "Synthetic Browser Result Auction",
    category: "Test",
    imagePath: "",
    minBid: 0.1,
    maxBid: 10,
    startsAt: AdminTimestamp.fromMillis(Date.now() - 60_000),
    endsAt: AdminTimestamp.fromMillis(Date.now() - 1_000),
    status,
    bidCount,
    createdAt: AdminTimestamp.now(),
    updatedAt: AdminTimestamp.now(),
  });
}

async function main() {
  const adminUser = await createEmulatorUser(`publisher-${suffix}@example.test`, "Synthetic Admin", { admin: true });
  const winnerUid = `synthetic-winner-${suffix}`;
  await adminDb.doc(`users/${winnerUid}`).set({ uid: winnerUid, name: "Browser Test Winner", phone: "+251911765432", role: "user", status: "active" });
  const adminClient = await createWebClient(`winner-publish-web-${suffix}`, `publisher-${suffix}@example.test`);
  assert.equal(adminClient.uid, adminUser.uid);

  const auctionId = `frontend-result-${suffix}`;
  await seedAuction(auctionId, "published", 3);
  const bids = [
    { id: "entry-a", uid: `synthetic-bidder-a-${suffix}`, amount: 0.25 },
    { id: "entry-b", uid: `synthetic-bidder-b-${suffix}`, amount: 0.25 },
    { id: "entry-c", uid: winnerUid, amount: 0.75 },
  ];
  for (const bid of bids) {
    await adminDb.doc(`auctions/${auctionId}/entries/${bid.id}`).set({ uid: bid.uid, amount: bid.amount, createdAt: AdminTimestamp.now() });
    await adminDb.doc(`users/${bid.uid}/bids/${bid.id}`).set({ auctionId, amount: bid.amount, auctionTitle: "Synthetic Browser Result Auction", isWinningBid: false, auctionStatus: "live", createdAt: AdminTimestamp.now() });
  }

  const result = await publishFirestoreAuctionResult(adminClient.db, adminClient.uid, auctionId);
  assert.equal(result.resultType, "winner");
  assert.equal(result.winningAmount, 0.75);
  assert.equal(result.validBidCount, 3);
  assert.match(result.resultHash, /^[a-f0-9]{64}$/);
  assert.match(result.referenceCode, /^CH-/);
  assert.equal((await adminDb.doc(`auctions/${auctionId}`).get()).get("status"), "completed");
  assert.equal((await adminDb.doc(`results/${auctionId}`).get()).get("winnerName"), "Browser Test Winner");
  assert.equal((await adminDb.doc(`users/${winnerUid}/wins/${auctionId}`).get()).exists, true);
  assert.equal((await adminDb.doc(`users/${winnerUid}/bids/entry-c`).get()).get("isWinningBid"), true);
  assert.equal((await adminDb.doc(`users/${winnerUid}/notifications/auction-${auctionId}-result`).get()).exists, true);
  assert.equal((await adminDb.collection("auditLogs").where("entityId", "==", auctionId).get()).size, 1);

  const repeated = await publishFirestoreAuctionResult(adminClient.db, adminClient.uid, auctionId);
  assert.equal(repeated.alreadyPublished, true, "Repeat clicks should return the existing result without duplicate writes");
  assert.equal(repeated.referenceCode, result.referenceCode);

  const nonAdmin = await createEmulatorUser(`regular-${suffix}@example.test`, "Synthetic Regular User");
  const nonAdminClient = await createWebClient(`winner-nonadmin-web-${suffix}`, `regular-${suffix}@example.test`);
  assert.equal(nonAdminClient.uid, nonAdmin.uid);
  const protectedAuctionId = `protected-result-${suffix}`;
  await seedAuction(protectedAuctionId, "live", 0);
  await assert.rejects(
    publishFirestoreAuctionResult(nonAdminClient.db, nonAdminClient.uid, protectedAuctionId),
    /permission|insufficient|denied/i,
    "Non-admin clients must not publish results",
  );
  assert.equal((await adminDb.doc(`results/${protectedAuctionId}`).get()).exists, false);
  assert.equal((await adminDb.doc(`auctions/${protectedAuctionId}`).get()).get("status"), "live");

  console.log(JSON.stringify({ ok: true, projectId, adminClientPublication: true, endedPublishedAuction: true, winnerRecordsNotificationsAndAudit: true, repeatIsIdempotent: true, nonAdminDenied: true, referenceCode: result.referenceCode }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await Promise.all(clientApps.map((app) => import("firebase/app").then(({ deleteApp }) => deleteApp(app))));
  await deleteAdminApp(adminApp);
});
