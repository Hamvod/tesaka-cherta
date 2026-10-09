import { createHash } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { CALLABLE_OPTIONS, db, finiteNumber, millisFromFirestore, requireActive, requireAdmin, requireCaller, requireUser, serverTimestamp, text, validateFirestoreJpeg, writeAuditInTransaction } from "./common";

function paymentReferenceRef(reference: string) {
  const normalized = reference.trim().replace(/\s+/g, "").toLowerCase();
  return db.doc(`paymentReferences/${createHash("sha256").update(normalized).digest("hex")}`);
}

function paymentOcrHint(ocrText: string): "success_terms" | "failure_terms" | "unclear" {
  const normalized = ocrText.toLowerCase();
  if (/\b(failed|failure|declined|reversed|cancelled|canceled|unsuccessful)\b|\bnot\s+(?:successful|completed|paid)\b|(?:አልተሳካም|አልተፈጸመም|ተሰርዟል)/u.test(normalized)) return "failure_terms";
  if (/\b(successful|success|completed|complete|paid|payment received|transfer successful)\b|(?:ተሳክቷል|ተጠናቋል|ተከፍሏል)/u.test(normalized)) return "success_terms";
  return "unclear";
}

export const requestOwnerAccess = onCall(CALLABLE_OPTIONS, async (request) => {
  const caller = await requireUser(request);
  if (caller.token.admin === true || caller.token.owner === true) throw new HttpsError("failed-precondition", "This account already has portal access.");
  const businessName = text(request.data.businessName, "Business or seller name", 120, 2);
  const city = text(request.data.city, "City", 100, 2);
  const contactPhone = text(request.data.contactPhone, "Contact phone", 40, 7);
  const description = text(request.data.description, "Seller description", 2000, 20);
  const applicationRef = db.doc(`ownerApplications/${caller.uid}`);
  const profileRef = db.doc(`users/${caller.uid}`);
  await db.runTransaction(async (tx) => {
    const [application, profile] = await Promise.all([tx.get(applicationRef), tx.get(profileRef)]);
    if (profile.exists && ["approved", "pending"].includes(String(profile.get("ownerStatus")))) {
      throw new HttpsError("failed-precondition", "An owner application is already approved or under review.");
    }
    if (application.exists && application.get("status") === "pending") {
      throw new HttpsError("failed-precondition", "An owner application is already under review.");
    }
    tx.set(applicationRef, {
      uid: caller.uid, businessName, city, contactPhone, description,
      status: "pending", submittedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    tx.set(profileRef, { ownerApplicationStatus: "pending", updatedAt: serverTimestamp() }, { merge: true });
    writeAuditInTransaction(tx, caller.uid, "owner.application_submitted", "ownerApplication", caller.uid);
  });
  return { status: "pending" };
});

export const reviewOwnerApplication = onCall(CALLABLE_OPTIONS, async (request) => {
  const caller = await requireAdmin(request);
  const uid = text(request.data.uid, "Applicant UID", 128, 5);
  const decision = request.data.decision;
  if (decision !== "approve" && decision !== "reject") throw new HttpsError("invalid-argument", "Choose approve or reject.");
  const note = typeof request.data.note === "string" ? request.data.note.trim().slice(0, 1000) : "";
  const applicationRef = db.doc(`ownerApplications/${uid}`);
  const profileRef = db.doc(`users/${uid}`);
  const notificationRef = db.collection(`users/${uid}/notifications`).doc(`owner-review-${Date.now()}`);
  const [application, profile, authUser] = await Promise.all([
    applicationRef.get(), profileRef.get(), getAuth().getUser(uid).catch(() => null),
  ]);
  if (!application.exists || !profile.exists || !authUser) throw new HttpsError("not-found", "Owner application or account not found.");
  if (application.get("status") !== "pending") throw new HttpsError("failed-precondition", "This application is no longer pending.");
  if (authUser.customClaims?.admin === true) throw new HttpsError("failed-precondition", "Administrator accounts cannot be changed into owners from this screen.");

  const approved = decision === "approve";
  await db.runTransaction(async (tx) => {
    const current = await tx.get(applicationRef);
    if (!current.exists || current.get("status") !== "pending") throw new HttpsError("aborted", "The application was reviewed by another administrator.");
    tx.update(applicationRef, { status: approved ? "approved" : "rejected", reviewNote: note || null, reviewedBy: caller.uid, reviewedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    tx.set(profileRef, { role: approved ? "owner" : "user", ownerStatus: approved ? "approved" : "rejected", ownerApplicationStatus: approved ? "approved" : "rejected", updatedAt: serverTimestamp() }, { merge: true });
    tx.create(notificationRef, {
      type: "owner_application", titleKey: approved ? "notice.ownerApproved.title" : "notice.ownerRejected.title",
      bodyKey: approved ? "notice.ownerApproved.body" : "notice.ownerRejected.body", params: { note },
      createdAt: serverTimestamp(), readAt: null,
    });
    writeAuditInTransaction(tx, caller.uid, `owner.application_${decision}d`, "ownerApplication", uid);
  });
  await getAuth().setCustomUserClaims(uid, { ...(authUser.customClaims ?? {}), owner: approved });
  return { status: approved ? "approved" : "rejected", uid };
});

export const recordManualPayment = onCall(CALLABLE_OPTIONS, async (request) => {
  const caller = await requireAdmin(request);
  const uid = text(request.data.uid, "Bidder UID", 128, 5);
  const auctionId = text(request.data.auctionId, "Auction ID", 128, 5);
  const providerReference = text(request.data.providerReference, "Payment reference", 160, 3);
  const status = request.data.status;
  if (status !== "pending" && status !== "paid") throw new HttpsError("invalid-argument", "Payment status must be pending or paid.");
  const userRef = db.doc(`users/${uid}`);
  const auctionRef = db.doc(`auctions/${auctionId}`);
  const uniqueRef = paymentReferenceRef(providerReference);
  const paymentRef = db.collection(`users/${uid}/payments`).doc();
  await db.runTransaction(async (tx) => {
    const [user, auction, usedReference] = await Promise.all([tx.get(userRef), tx.get(auctionRef), tx.get(uniqueRef)]);
    if (!user.exists || !auction.exists) throw new HttpsError("not-found", "Choose an existing bidder and auction.");
    if (user.get("status") === "suspended") throw new HttpsError("failed-precondition", "Cannot record a payment for a suspended account.");
    if (usedReference.exists) throw new HttpsError("already-exists", "That payment reference has already been recorded.");
    const bidFee = finiteNumber(auction.get("bidFee"), "Auction bid fee", 0, 1000000);
    tx.create(paymentRef, {
      uid, auctionId, auctionTitle: String(auction.get("title") ?? "Auction"), amount: bidFee,
      provider: "manual", providerReference, status, used: false, createdAt: serverTimestamp(), createdBy: caller.uid,
    });
    tx.create(uniqueRef, { uid, auctionId, paymentId: paymentRef.id, createdAt: serverTimestamp() });
    writeAuditInTransaction(tx, caller.uid, status === "paid" ? "payment.manually_verified" : "payment.pending_recorded", "payment", paymentRef.id);
  });
  return { paymentId: paymentRef.id, status };
});

export const submitPaymentProof = onCall(CALLABLE_OPTIONS, async (request) => {
  const caller = await requireUser(request);
  const auctionId = text(request.data.auctionId, "Auction ID", 128, 5);
  const provider = text(request.data.provider, "Payment provider", 80, 2);
  const rawReference = typeof request.data.providerReference === "string" ? request.data.providerReference.trim() : "";
  if (rawReference && (rawReference.length < 3 || rawReference.length > 160)) {
    throw new HttpsError("invalid-argument", "Transaction number must be between 3 and 160 characters.");
  }
  const providerReference = rawReference;
  const proofImage = request.data.proofImageDataUrl === undefined || request.data.proofImageDataUrl === null
    ? null
    : validateFirestoreJpeg(request.data.proofImageDataUrl, "Receipt image");
  const ocrText = typeof request.data.ocrText === "string" ? request.data.ocrText.trim().slice(0, 6000) : "";
  if (!providerReference && !proofImage) throw new HttpsError("invalid-argument", "Enter a transaction number or submit a receipt image.");

  const profileRef = db.doc(`users/${caller.uid}`);
  const auctionRef = db.doc(`auctions/${auctionId}`);
  const rateRef = db.doc(`rateLimits/payment-proof-${caller.uid}`);
  const uniqueReference = providerReference ? paymentReferenceRef(providerReference) : null;
  const paymentRef = db.collection(`users/${caller.uid}/payments`).doc();
  const proofImageRef = paymentRef.collection("proofs").doc("receipt");
  const hint = paymentOcrHint(ocrText);
  const hourBucket = Math.floor(Date.now() / 3_600_000);
  await db.runTransaction(async (tx) => {
    const [profile, auction, rate, duplicate] = await Promise.all([
      tx.get(profileRef), tx.get(auctionRef), tx.get(rateRef), uniqueReference ? tx.get(uniqueReference) : Promise.resolve(null),
    ]);
    if (!profile.exists || profile.get("status") === "suspended") throw new HttpsError("permission-denied", "This account cannot submit payment proof.");
    if (!auction.exists) throw new HttpsError("not-found", "Auction not found.");
    if (!["published", "live"].includes(String(auction.get("status"))) || millisFromFirestore(auction.get("endsAt")) <= Date.now()) {
      throw new HttpsError("failed-precondition", "Payment proof can only be submitted for an open auction.");
    }
    const amount = finiteNumber(auction.get("bidFee"), "Auction bid fee", 0, 1000000);
    if (amount <= 0) throw new HttpsError("failed-precondition", "This auction does not require a payment fee.");
    if (duplicate?.exists) throw new HttpsError("already-exists", "That transaction number has already been submitted.");
    const previous = rate.data() ?? {};
    const count = Number(previous.hourBucket) === hourBucket ? Number(previous.count ?? 0) + 1 : 1;
    if (count > 5) throw new HttpsError("resource-exhausted", "You have reached the payment-proof submission limit. Try again later.");
    tx.create(paymentRef, {
      uid: caller.uid, auctionId, auctionTitle: String(auction.get("title") ?? "Auction"), amount,
      provider, providerReference, source: "bidder_proof", hasReceiptImage: Boolean(proofImage), ocrText: ocrText || null,
      ocrStatusHint: hint, status: "pending", used: false, createdAt: serverTimestamp(), submittedBy: caller.uid,
    });
    if (proofImage) tx.create(proofImageRef, {
      uid: caller.uid, paymentId: paymentRef.id, imageDataUrl: proofImage.dataUrl, contentType: "image/jpeg",
      byteLength: proofImage.byteLength, createdAt: serverTimestamp(),
    });
    if (uniqueReference) tx.create(uniqueReference, { uid: caller.uid, auctionId, paymentId: paymentRef.id, createdAt: serverTimestamp() });
    tx.set(rateRef, { hourBucket, count, updatedAt: serverTimestamp() });
    writeAuditInTransaction(tx, caller.uid, "payment.proof_submitted", "payment", paymentRef.id);
  });
  return { paymentId: paymentRef.id, status: "pending", ocrStatusHint: hint };
});

export const reviewPaymentProof = onCall(CALLABLE_OPTIONS, async (request) => {
  const caller = await requireAdmin(request);
  const uid = text(request.data.uid, "Bidder UID", 128, 5);
  const paymentId = text(request.data.paymentId, "Payment ID", 128, 5);
  const decision = request.data.decision;
  if (decision !== "paid" && decision !== "failed") throw new HttpsError("invalid-argument", "Choose paid or failed.");
  const note = typeof request.data.note === "string" ? request.data.note.trim().slice(0, 500) : "";
  const paymentRef = db.doc(`users/${uid}/payments/${paymentId}`);
  const notificationRef = db.doc(`users/${uid}/notifications/payment-review-${paymentId}`);
  await db.runTransaction(async (tx) => {
    const payment = await tx.get(paymentRef);
    if (!payment.exists || payment.get("source") !== "bidder_proof") throw new HttpsError("not-found", "Submitted payment proof not found.");
    if (payment.get("status") !== "pending" || payment.get("used") === true) throw new HttpsError("failed-precondition", "This payment proof is no longer pending review.");
    if (decision === "paid") {
      const auctionRef = db.doc(`auctions/${String(payment.get("auctionId") ?? "")}`);
      const auction = await tx.get(auctionRef);
      if (!auction.exists || !["published", "live"].includes(String(auction.get("status"))) || millisFromFirestore(auction.get("endsAt")) <= Date.now()) {
        throw new HttpsError("failed-precondition", "The auction is no longer open; this payment proof cannot authorize a bid.");
      }
      if (Number(auction.get("bidFee")) !== Number(payment.get("amount"))) throw new HttpsError("failed-precondition", "The submitted payment amount no longer matches the auction fee.");
    }
    tx.update(paymentRef, {
      status: decision, reviewedBy: caller.uid, reviewedAt: serverTimestamp(), verificationNote: note || null,
      ...(decision === "paid" ? { verifiedBy: caller.uid, verifiedAt: serverTimestamp() } : {}),
    });
    tx.set(notificationRef, {
      type: "payment_review", titleKey: decision === "paid" ? "notice.paymentApproved.title" : "notice.paymentRejected.title",
      bodyKey: decision === "paid" ? "notice.paymentApproved.body" : "notice.paymentRejected.body",
      params: { auction: String(payment.get("auctionTitle") ?? "Auction"), note }, createdAt: serverTimestamp(), readAt: null,
    });
    writeAuditInTransaction(tx, caller.uid, `payment.proof_${decision}`, "payment", paymentId);
  });
  return { uid, paymentId, status: decision };
});

export const reviewReport = onCall(CALLABLE_OPTIONS, async (request) => {
  const caller = await requireAdmin(request);
  const reportId = text(request.data.reportId, "Report ID", 128, 5);
  const status = request.data.status;
  if (!(["open", "reviewing", "resolved", "dismissed"] as unknown[]).includes(status)) {
    throw new HttpsError("invalid-argument", "Choose a valid report status.");
  }
  const adminNotes = typeof request.data.adminNotes === "string" ? request.data.adminNotes.trim().slice(0, 2000) : "";
  const adminReply = typeof request.data.adminReply === "string" ? request.data.adminReply.trim().slice(0, 2000) : "";
  const reportRef = db.doc(`reports/${reportId}`);
  const privateRef = db.doc(`reports/${reportId}/private/review`);
  const [report, privateReview] = await Promise.all([reportRef.get(), privateRef.get()]);
  if (!report.exists) throw new HttpsError("not-found", "Report not found.");
  const uid = String(report.get("uid") ?? "");
  if (!uid) throw new HttpsError("data-loss", "Report has no reporter account.");
  const notificationRef = db.collection(`users/${uid}/notifications`).doc(`report-${reportId}-${Date.now()}`);
  await db.runTransaction(async (tx) => {
    const [current, currentPrivate] = await Promise.all([tx.get(reportRef), tx.get(privateRef)]);
    if (!current.exists) throw new HttpsError("not-found", "Report not found.");
    tx.update(reportRef, { status, adminReply: adminReply || null, reviewedBy: caller.uid, reviewedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    tx.set(privateRef, { adminNotes: adminNotes || null, updatedBy: caller.uid, updatedAt: serverTimestamp(), ...(privateReview.exists ? {} : { createdAt: serverTimestamp() }) }, { merge: true });
    if (adminReply || current.get("status") !== status) {
      tx.create(notificationRef, {
        type: "report_update", titleKey: "notice.reportUpdate.title", bodyKey: "notice.reportUpdate.body",
        params: { subject: String(current.get("subject") ?? "Report"), status: String(status) }, createdAt: serverTimestamp(), readAt: null,
      });
    }
    writeAuditInTransaction(tx, caller.uid, "report.review_updated", "report", reportId);
    void currentPrivate;
  });
  return { reportId, status };
});

export const setUserStatus = onCall(CALLABLE_OPTIONS, async (request) => {
  const caller = await requireAdmin(request);
  const uid = text(request.data.uid, "User UID", 128, 5);
  const status = request.data.status;
  if (status !== "active" && status !== "suspended") throw new HttpsError("invalid-argument", "Choose active or suspended.");
  if (uid === caller.uid) throw new HttpsError("failed-precondition", "You cannot suspend your own account.");
  const profileRef = db.doc(`users/${uid}`);
  const authUser = await getAuth().getUser(uid).catch(() => null);
  if (!authUser) throw new HttpsError("not-found", "Firebase Auth user not found.");
  if (authUser.customClaims?.admin === true) throw new HttpsError("failed-precondition", "Administrator accounts cannot be suspended from this screen.");
  await profileRef.set({ status, updatedAt: serverTimestamp(), statusChangedBy: caller.uid, statusChangedAt: serverTimestamp() }, { merge: true });
  try {
    await getAuth().updateUser(uid, { disabled: status === "suspended" });
  } catch (error) {
    await profileRef.set({ status: status === "suspended" ? "active" : "suspended", updatedAt: serverTimestamp() }, { merge: true });
    throw new HttpsError("internal", "Could not update Firebase Authentication status.");
  }
  await db.collection("auditLogs").add({ actorUid: caller.uid, action: status === "suspended" ? "user.suspended" : "user.reactivated", entityType: "user", entityId: uid, createdAt: FieldValue.serverTimestamp() });
  return { uid, status };
});

export const submitSupportReport = onCall(CALLABLE_OPTIONS, async (request) => {
  const caller = await requireUser(request);
  const category = request.data.category;
  if (!(["account", "auction", "payment", "safety", "other"] as unknown[]).includes(category)) throw new HttpsError("invalid-argument", "Choose a valid report category.");
  const subject = text(request.data.subject, "Subject", 160, 4);
  const details = text(request.data.details, "Details", 4000, 20);
  const targetType = typeof request.data.targetType === "string" ? request.data.targetType.trim().slice(0, 50) : null;
  const targetId = typeof request.data.targetId === "string" ? request.data.targetId.trim().slice(0, 128) : null;
  const reportRef = db.collection("reports").doc();
  const rateRef = db.doc(`rateLimits/report-${caller.uid}`);
  const minuteBucket = Math.floor(Date.now() / 3_600_000);
  await db.runTransaction(async (tx) => {
    const rate = await tx.get(rateRef);
    const previous = rate.data() ?? {};
    const count = Number(previous.hourBucket) === minuteBucket ? Number(previous.count ?? 0) + 1 : 1;
    if (count > 5) throw new HttpsError("resource-exhausted", "You have reached the report limit. Try again later.");
    tx.create(reportRef, {
      uid: caller.uid, category, subject, details, targetType, targetId, status: "open", adminReply: null,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    tx.set(rateRef, { hourBucket: minuteBucket, count, updatedAt: serverTimestamp() });
    writeAuditInTransaction(tx, caller.uid, "report.submitted", "report", reportRef.id);
  });
  return { reportId: reportRef.id, status: "open" };
});
