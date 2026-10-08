import { createHash } from "node:crypto";
import { getAuth } from "firebase-admin/auth";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { db, finiteNumber, requireActive, requireAdmin, requireCaller, requireUser, serverTimestamp, text, writeAuditInTransaction } from "./common";

export const requestOwnerAccess = onCall(async (request) => {
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

export const reviewOwnerApplication = onCall(async (request) => {
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

export const recordManualPayment = onCall(async (request) => {
  const caller = await requireAdmin(request);
  const uid = text(request.data.uid, "Bidder UID", 128, 5);
  const auctionId = text(request.data.auctionId, "Auction ID", 128, 5);
  const providerReference = text(request.data.providerReference, "Payment reference", 160, 3);
  const status = request.data.status;
  if (status !== "pending" && status !== "paid") throw new HttpsError("invalid-argument", "Payment status must be pending or paid.");
  const userRef = db.doc(`users/${uid}`);
  const auctionRef = db.doc(`auctions/${auctionId}`);
  const refHash = createHash("sha256").update(`${uid}|${auctionId}|${providerReference.toLowerCase()}`).digest("hex");
  const uniqueRef = db.doc(`paymentReferences/${refHash}`);
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

export const reviewReport = onCall(async (request) => {
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

export const setUserStatus = onCall(async (request) => {
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

export const submitSupportReport = onCall(async (request) => {
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
