const assert = require("node:assert/strict");
const { initializeApp, deleteApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");

process.env.FIREBASE_AUTH_EMULATOR_HOST ||= "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST ||= "127.0.0.1:8080";
const projectId = process.env.GCLOUD_PROJECT || "demo-tesaka-cherta";
const app = initializeApp({ projectId }, `emulator-smoke-${Date.now()}`);
const auth = getAuth(app);
const db = getFirestore(app);

async function createAccount(email, name, claims = {}) {
  const user = await auth.createUser({ email, password: "local-only-test-password", displayName: name });
  await auth.setCustomUserClaims(user.uid, claims);
  await db.doc(`users/${user.uid}`).set({ uid: user.uid, name, email, phone: "+251911123456", role: claims.admin ? "admin" : "user", status: "active" });
  const response = await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "local-only-test-password", returnSecureToken: true }),
  });
  const payload = await response.json();
  assert.equal(response.ok, true, `Auth emulator login failed: ${JSON.stringify(payload)}`);
  return { ...user, idToken: payload.idToken };
}

async function signIn(email) {
  const response = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password: "local-only-test-password", returnSecureToken: true }),
  });
  const payload = await response.json();
  assert.equal(response.ok, true, `Auth emulator login failed: ${JSON.stringify(payload)}`);
  return payload.idToken;
}

async function callFunction(name, idToken, data) {
  const response = await fetch(`http://127.0.0.1:5001/${projectId}/us-central1/${name}`, {
    method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ data }),
  });
  const body = await response.json();
  if (!response.ok || body.error) {
    const error = new Error(body.error?.message || `${name} failed with HTTP ${response.status}`);
    error.code = body.error?.status;
    throw error;
  }
  return body.result;
}

const testJpeg = `data:image/jpeg;base64,${Buffer.from([
  0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x01, 0x00, 0x01,
  0x03, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01, 0xff, 0xd9,
]).toString("base64")}`;

async function readDocumentAsUser(documentPath, idToken) {
  const headers = idToken ? { authorization: `Bearer ${idToken}` } : {};
  return fetch(`http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`, { headers });
}

async function deleteDocumentAsUser(documentPath, idToken) {
  return fetch(`http://127.0.0.1:8080/v1/projects/${projectId}/databases/(default)/documents/${documentPath}`, {
    method: "DELETE", headers: { authorization: `Bearer ${idToken}` },
  });
}

async function expectCallableError(name, idToken, data, expectedStatus) {
  let failure;
  try { await callFunction(name, idToken, data); } catch (error) { failure = error; }
  assert.ok(failure, `${name} should have rejected the invalid request`);
  assert.equal(failure.code, expectedStatus, `Unexpected callable status for ${name}: ${failure.message}`);
}

(async () => {
  const admin = await createAccount(`admin-${Date.now()}@example.test`, "Emulator Admin", { admin: true });
  const cors = await fetch(`http://127.0.0.1:5001/${projectId}/us-central1/closeAuctionForEditing`, {
    method: "OPTIONS", headers: { origin: "https://tesaka-cherta.vercel.app", "access-control-request-method": "POST", "access-control-request-headers": "authorization,content-type" },
  });
  assert.ok(cors.status === 200 || cors.status === 204, `Callable preflight should succeed; got HTTP ${cors.status}`);
  assert.equal(cors.headers.get("access-control-allow-origin"), "https://tesaka-cherta.vercel.app");
  const owner = await createAccount(`owner-${Date.now()}@example.test`, "Emulator Seller");
  const bidders = await Promise.all([1, 2, 3, 4].map((number) => createAccount(`bidder-${number}-${Date.now()}@example.test`, `Bidder ${number}`)));

  await callFunction("requestOwnerAccess", owner.idToken, {
    businessName: "Emulator Seller Shop", city: "Addis Ababa", contactPhone: "+251911123456",
    description: "Local emulator seller application with sufficient details for review.",
  });
  await callFunction("reviewOwnerApplication", admin.idToken, { uid: owner.uid, decision: "approve", note: "Verified in emulator." });
  const ownerIdToken = await signIn(owner.email);
  await expectCallableError("createAuction", ownerIdToken, {
    title: "Invalid image listing", category: "Test", description: "This listing deliberately submits an invalid image payload.",
    sellerName: "Emulator Seller Shop", imageDataUrl: "data:image/jpeg;base64,SGVsbG8=", bidFee: 1, minBid: 0.1, maxBid: 100,
    maxBidsPerUser: 5, startsAtMs: Date.now() + 60_000, endsAtMs: Date.now() + 3_600_000,
  }, "INVALID_ARGUMENT");
  const ownerAuction = await callFunction("createAuction", ownerIdToken, {
    title: "Owner emulator listing", category: "Test", description: "A seller-created product listing for local emulator validation.",
    sellerName: "Emulator Seller Shop", imageDataUrl: testJpeg, bidFee: 1, minBid: 0.1, maxBid: 100,
    maxBidsPerUser: 5, startsAtMs: Date.now() + 60_000, endsAtMs: Date.now() + 3_600_000,
  });
  assert.equal(ownerAuction.status, "draft");
  await callFunction("submitAuctionForReview", ownerIdToken, { auctionId: ownerAuction.auctionId });
  const listingReview = await callFunction("reviewAuction", admin.idToken, { auctionId: ownerAuction.auctionId, decision: "approve" });
  assert.equal(listingReview.status, "approve");
  assert.equal((await db.doc(`auctions/${ownerAuction.auctionId}`).get()).get("status"), "published");
  assert.equal((await db.doc(`auctions/${ownerAuction.auctionId}`).get()).get("imagePath"), `firestore-image:${ownerAuction.auctionId}`);
  assert.equal((await auth.getUser(owner.uid)).customClaims.owner, true);
  const publicImageRead = await readDocumentAsUser(`auctionImages/${ownerAuction.auctionId}`);
  assert.equal(publicImageRead.ok, true, "Published auction image should be publicly readable from Firestore");
  assert.equal((await readDocumentAsUser(`auctionImages/${ownerAuction.auctionId}`, bidders[0].idToken)).ok, true, "A bidder should read a public Firestore auction image");
  assert.equal((await readDocumentAsUser(`auctionImages/${ownerAuction.auctionId}`, ownerIdToken)).ok, true, "The listing owner should read its Firestore image");
  assert.equal((await readDocumentAsUser(`auctionImages/${ownerAuction.auctionId}`, admin.idToken)).ok, true, "Admin should read Firestore auction images");
  assert.equal((await deleteDocumentAsUser(`auctionImages/${ownerAuction.auctionId}`, ownerIdToken)).status, 403, "Browser writes to auction image documents must be denied");
  await callFunction("closeAuctionForEditing", admin.idToken, { auctionId: ownerAuction.auctionId });
  assert.equal((await db.doc(`auctions/${ownerAuction.auctionId}`).get()).get("status"), "closed");
  assert.equal((await readDocumentAsUser(`auctionImages/${ownerAuction.auctionId}`, bidders[0].idToken)).status, 403, "Draft/closed listing images must not be public");
  assert.equal((await readDocumentAsUser(`auctionImages/${ownerAuction.auctionId}`, ownerIdToken)).ok, true, "The listing owner retains access while editing");
  const editedAuction = await callFunction("updateAuction", admin.idToken, {
    auctionId: ownerAuction.auctionId, title: "Edited owner emulator listing", category: "Test",
    description: "Edited using the trusted callable, retaining the already uploaded image.", sellerName: "Emulator Seller Shop",
    bidFee: 1, minBid: 0.1, maxBid: 100, maxBidsPerUser: 5,
    startsAtMs: Date.now() + 60_000, endsAtMs: Date.now() + 3_600_000,
  });
  assert.equal(editedAuction.status, "draft");
  const editedDoc = await db.doc(`auctions/${ownerAuction.auctionId}`).get();
  assert.equal(editedDoc.get("title"), "Edited owner emulator listing");
  assert.equal(editedDoc.get("imagePath"), `firestore-image:${ownerAuction.auctionId}`, "Editing should retain the existing Firestore image when no replacement is selected");
  assert.equal((await db.doc(`auctionImages/${ownerAuction.auctionId}`).get()).get("imageDataUrl"), testJpeg, "Image document should remain separate from listing metadata");
  assert.equal((await db.doc(`products/${ownerAuction.auctionId}`).get()).get("status"), "draft");
  await callFunction("publishAuction", admin.idToken, { auctionId: ownerAuction.auctionId });
  assert.equal((await db.doc(`auctions/${ownerAuction.auctionId}`).get()).get("status"), "published");

  const proofAuctionId = `proof-smoke-${Date.now()}`;
  await db.doc(`auctions/${proofAuctionId}`).set({
    ownerUid: admin.uid, ownerName: admin.displayName, title: "Payment proof smoke auction", category: "Test",
    description: "Local-only auction for bidder payment proof verification.", imagePath: "https://example.test/proof.jpg",
    bidFee: 1, minBid: 0.1, maxBid: 100, maxBidsPerUser: 5,
    startsAt: Timestamp.fromMillis(Date.now() - 60_000), endsAt: Timestamp.fromMillis(Date.now() + 60 * 60_000),
    status: "live", bidCount: 0, createdAt: Timestamp.now(),
  });
  const submittedProof = await callFunction("submitPaymentProof", bidders[3].idToken, {
    auctionId: proofAuctionId, provider: "Telebirr", providerReference: `PROOF-${Date.now()}`,
    proofImageDataUrl: testJpeg,
  });
  assert.equal(submittedProof.status, "pending", "Submitted proof must remain pending until independently reviewed");
  const pendingProofRef = db.doc(`users/${bidders[3].uid}/payments/${submittedProof.paymentId}`);
  assert.equal((await pendingProofRef.get()).get("status"), "pending");
  assert.equal((await pendingProofRef.get()).get("hasReceiptImage"), true, "The payment list record should only contain a receipt flag");
  assert.equal((await pendingProofRef.get()).get("ocrText"), undefined, "New proof records must not store OCR text");
  assert.equal((await pendingProofRef.get()).get("ocrStatusHint"), undefined, "New proof records must not store OCR hints");
  const proofDocPath = `users/${bidders[3].uid}/payments/${submittedProof.paymentId}/proofs/receipt`;
  assert.equal((await readDocumentAsUser(proofDocPath, bidders[3].idToken)).ok, true, "Receipt owner should read its private Firestore proof document");
  assert.equal((await readDocumentAsUser(proofDocPath, bidders[0].idToken)).status, 403, "Another bidder must not read the private Firestore proof document");
  assert.equal((await readDocumentAsUser(proofDocPath, admin.idToken)).ok, true, "Admin should inspect the private Firestore proof document");
  assert.equal((await deleteDocumentAsUser(proofDocPath, bidders[3].idToken)).status, 403, "Browser writes to private payment proof documents must be denied");
  const paymentDocPath = `users/${bidders[3].uid}/payments/${submittedProof.paymentId}`;
  assert.equal((await readDocumentAsUser(paymentDocPath, admin.idToken)).ok, true, "Admin should read a bidder payment record directly");
  assert.equal((await readDocumentAsUser(paymentDocPath, bidders[0].idToken)).status, 403, "Other bidders must not read each other's payment records");
  await expectCallableError("placeBid", bidders[3].idToken, { auctionId: proofAuctionId, amount: 1.25, paymentId: submittedProof.paymentId }, "FAILED_PRECONDITION");
  await expectCallableError("reviewPaymentProof", bidders[3].idToken, { uid: bidders[3].uid, paymentId: submittedProof.paymentId, decision: "paid" }, "PERMISSION_DENIED");
  const reviewedProof = await callFunction("reviewPaymentProof", admin.idToken, { uid: bidders[3].uid, paymentId: submittedProof.paymentId, decision: "paid" });
  assert.equal(reviewedProof.status, "paid");
  assert.equal((await pendingProofRef.get()).get("verifiedBy"), admin.uid);
  await callFunction("placeBid", bidders[3].idToken, { auctionId: proofAuctionId, amount: 1.25, paymentId: submittedProof.paymentId });
  assert.equal((await pendingProofRef.get()).get("used"), true, "Approved proof must be consumed once by the trusted bid callable");
  assert.equal((await db.doc(`users/${bidders[3].uid}/notifications/payment-review-${submittedProof.paymentId}`).get()).exists, true);

  const auctionId = `smoke-${Date.now()}`;
  const now = Date.now();
  const auctionRef = db.doc(`auctions/${auctionId}`);
  await auctionRef.set({
    ownerUid: admin.uid, ownerName: admin.displayName, title: "Emulator test product", category: "Test",
    description: "A local-only product used to verify the lowest unique bid transaction.",
    imagePath: "https://example.test/emulator-product.jpg", bidFee: 1, minBid: 0.1, maxBid: 100,
    maxBidsPerUser: 5, startsAt: Timestamp.fromMillis(now - 60_000), endsAt: Timestamp.fromMillis(now + 60 * 60_000),
    status: "live", bidCount: 0, createdAt: Timestamp.now(),
  });
  for (const bidder of bidders.slice(0, 3)) {
    await db.doc(`users/${bidder.uid}/payments/pay-${bidder.uid}`).set({
      uid: bidder.uid, auctionId, auctionTitle: "Emulator test product", amount: 1,
      provider: "emulator", providerReference: `test-${bidder.uid}`, status: "paid", used: false, createdAt: Timestamp.now(),
    });
  }

  await Promise.all([
    callFunction("placeBid", bidders[0].idToken, { auctionId, amount: 8, paymentId: `pay-${bidders[0].uid}` }),
    callFunction("placeBid", bidders[1].idToken, { auctionId, amount: 3.5, paymentId: `pay-${bidders[1].uid}` }),
    callFunction("placeBid", bidders[2].idToken, { auctionId, amount: 8, paymentId: `pay-${bidders[2].uid}` }),
  ]);
  await expectCallableError("placeBid", bidders[3].idToken, { auctionId, amount: 2.5 }, "FAILED_PRECONDITION");
  await expectCallableError("closeAuctionForEditing", admin.idToken, { auctionId }, "FAILED_PRECONDITION");
  assert.equal((await auctionRef.get()).get("status"), "live", "An auction with accepted bids must remain live");
  assert.equal((await auctionRef.get()).get("bidCount"), 3, "Rejected bid must not increment the accepted bid counter");
  assert.equal((await db.doc(`users/${bidders[0].uid}/payments/pay-${bidders[0].uid}`).get()).get("used"), true, "Verified payment should be consumed exactly once");

  await auctionRef.update({ endsAt: Timestamp.fromMillis(Date.now() - 1_000) });
  const result = await callFunction("finalizeAuctionNow", admin.idToken, { auctionId });
  assert.equal(result.resultType, "winner");
  assert.equal(result.winningAmount, 3.5, "The lowest amount submitted exactly once should win");
  assert.equal(result.validBidCount, 3);
  const published = await db.doc(`results/${auctionId}`).get();
  assert.equal(published.exists, true);
  assert.equal(published.get("winnerName"), "Bidder 2");
  assert.match(published.get("resultHash"), /^[a-f0-9]{64}$/);
  assert.equal((await auctionRef.get()).get("status"), "completed");
  assert.equal((await db.doc(`users/${bidders[1].uid}/wins/${auctionId}`).get()).exists, true);
  assert.equal((await db.doc(`users/${bidders[1].uid}/bids/${(await db.collection(`users/${bidders[1].uid}/bids`).limit(1).get()).docs[0].id}`).get()).get("isWinningBid"), true);
  assert.equal((await db.collection(`users/${bidders[1].uid}/notifications`).get()).size, 2, "Winner should receive bid acceptance and result notifications");
  await expectCallableError("placeBid", bidders[0].idToken, { auctionId, amount: 1, paymentId: `pay-${bidders[0].uid}` }, "FAILED_PRECONDITION");

  console.log(JSON.stringify({
    ok: true, projectId, ownerApplicationAndListing: "approved, image stored in Firestore, reviewed, published, closed for editing, updated, and republished", auctionId, acceptedBids: 3, rejectedUnpaidBid: true,
    duplicateAmount: 8, winner: "Bidder 2", winningAmount: result.winningAmount,
    resultReference: result.referenceCode, resultHash: result.resultHash,
    callableCorsAllowlist: true, invalidImageRejected: true, publicFirestoreAuctionImageRead: true, draftImagePrivacyAndNoClientWrites: true, privateFirestoreReceiptAccess: true, paymentProofReviewAndUse: true, adminPaymentDocumentAccess: true,
    paymentConsumed: true, winnerRecordAndNotifications: true,
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await deleteApp(app);
});
