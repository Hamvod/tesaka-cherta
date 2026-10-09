import { createHash, randomBytes } from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { CALLABLE_OPTIONS, db, finiteNumber, millis, millisFromFirestore, requireActive, requireAdmin, requireCaller, requireOwnerOrAdmin, requireUser, serverTimestamp, text, validateFirestoreJpeg, writeAuditInTransaction } from "./common";
import { parseAmountCents, selectLowestUniqueAmount } from "./domain";

function centsFromInput(value: unknown): number {
  try {
    return parseAmountCents(value);
  } catch (error) {
    throw new HttpsError("invalid-argument", error instanceof Error ? error.message : "Bid amount is invalid.");
  }
}

function publicationStatus(startsAt: number): "published" | "live" {
  return startsAt <= Date.now() ? "live" : "published";
}

export const createAuction = onCall(CALLABLE_OPTIONS, async (request) => {
  const caller = await requireOwnerOrAdmin(request);
  const data = request.data;
  const title = text(data.title, "Title", 220, 4);
  const category = text(data.category, "Category", 80, 2);
  const description = text(data.description, "Description", 5000, 20);
  const sellerName = text(data.sellerName, "Seller name", 100, 2);
  const image = validateFirestoreJpeg(data.imageDataUrl, "Product image");
  const bidFee = finiteNumber(data.bidFee, "Bid fee", 0, 1000000);
  const minBid = finiteNumber(data.minBid, "Minimum bid", 0.01, 10000000);
  const maxBid = finiteNumber(data.maxBid, "Maximum bid", minBid, 10000000);
  const maxBidsPerUser = finiteNumber(data.maxBidsPerUser, "Maximum bids per user", 1, 100);
  if (!Number.isInteger(maxBidsPerUser)) throw new HttpsError("invalid-argument", "Maximum bids per user must be a whole number.");
  const startsAtMs = millis(data.startsAtMs, "Opening time");
  const endsAtMs = millis(data.endsAtMs, "Closing time");
  if (startsAtMs <= Date.now() - 60_000 || endsAtMs <= startsAtMs) {
    throw new HttpsError("invalid-argument", "Closing time must be after the opening time, and the opening time cannot be in the past.");
  }
  const auctionRef = db.collection("auctions").doc();
  const productRef = db.collection("products").doc(auctionRef.id);
  const imageRef = db.doc(`auctionImages/${auctionRef.id}`);
  const imagePath = `firestore-image:${auctionRef.id}`;
  const ownerProfile = await db.doc(`users/${caller.uid}`).get();
  const ownerName = String(ownerProfile.get("name") ?? caller.token.name ?? sellerName);
  const stamp = serverTimestamp();
  const batch = db.batch();
  batch.create(imageRef, { auctionId: auctionRef.id, ownerUid: caller.uid, imageDataUrl: image.dataUrl, contentType: "image/jpeg", byteLength: image.byteLength, createdAt: stamp, updatedAt: stamp });
  batch.create(productRef, {
    productId: productRef.id, ownerUid: caller.uid, title, category, description,
    imagePath, sellerName, status: "draft", createdAt: stamp, updatedAt: stamp,
  });
  batch.create(auctionRef, {
    productId: productRef.id, ownerUid: caller.uid, ownerName, title, category, description,
    imagePath, sellerName, bidFee, minBid, maxBid, maxBidsPerUser,
    startsAt: Timestamp.fromMillis(startsAtMs), endsAt: Timestamp.fromMillis(endsAtMs),
    status: "draft", bidCount: 0, createdAt: stamp, updatedAt: stamp,
  });
  batch.create(db.collection("auditLogs").doc(), {
    actorUid: caller.uid, action: "auction.draft_created", entityType: "auction", entityId: auctionRef.id, createdAt: stamp,
  });
  await batch.commit();
  return { auctionId: auctionRef.id, status: "draft" };
});

export const submitAuctionForReview = onCall(CALLABLE_OPTIONS, async (request) => {
  const caller = await requireOwnerOrAdmin(request);
  const auctionId = text(request.data.auctionId, "Auction ID", 128, 5);
  const auctionRef = db.doc(`auctions/${auctionId}`);
  const productRef = db.doc(`products/${auctionId}`);
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(auctionRef);
    if (!snapshot.exists) throw new HttpsError("not-found", "Auction not found.");
    if (snapshot.get("ownerUid") !== caller.uid && caller.token.admin !== true) throw new HttpsError("permission-denied", "You do not own this listing.");
    if (!["draft", "rejected"].includes(String(snapshot.get("status")))) throw new HttpsError("failed-precondition", "Only a draft or rejected listing can be submitted.");
    tx.update(auctionRef, { status: "pending_review", submittedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    tx.set(productRef, { status: "pending_review", updatedAt: serverTimestamp() }, { merge: true });
    writeAuditInTransaction(tx, caller.uid, "auction.submitted_for_review", "auction", auctionId);
  });
  return { status: "pending_review" };
});

export const reviewAuction = onCall(CALLABLE_OPTIONS, async (request) => {
  const caller = await requireAdmin(request);
  const auctionId = text(request.data.auctionId, "Auction ID", 128, 5);
  const decision = request.data.decision;
  if (decision !== "approve" && decision !== "reject") throw new HttpsError("invalid-argument", "Choose approve or reject.");
  const note = typeof request.data.note === "string" ? request.data.note.trim().slice(0, 1000) : "";
  const auctionRef = db.doc(`auctions/${auctionId}`);
  const productRef = db.doc(`products/${auctionId}`);
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(auctionRef);
    if (!snapshot.exists) throw new HttpsError("not-found", "Auction not found.");
    if (!["pending_review", "draft", "rejected"].includes(String(snapshot.get("status")))) throw new HttpsError("failed-precondition", "This listing is not awaiting review.");
    let nextStatus: string;
    if (decision === "approve") {
      const startsAt = millisFromFirestore(snapshot.get("startsAt"));
      const endsAt = millisFromFirestore(snapshot.get("endsAt"));
      if (endsAt <= Date.now()) throw new HttpsError("failed-precondition", "The scheduled auction end time has passed.");
      nextStatus = publicationStatus(startsAt);
    } else {
      nextStatus = "rejected";
    }
    tx.update(auctionRef, { status: nextStatus, reviewNote: note || null, reviewedBy: caller.uid, reviewedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    tx.set(productRef, { status: nextStatus, updatedAt: serverTimestamp() }, { merge: true });
    writeAuditInTransaction(tx, caller.uid, `auction.${decision}d`, "auction", auctionId);
    const ownerUid = String(snapshot.get("ownerUid") ?? "");
    if (ownerUid) {
      tx.create(db.doc(`users/${ownerUid}/notifications/${auctionId}-review`), {
        type: "auction_review", titleKey: decision === "approve" ? "notice.auctionApproved.title" : "notice.auctionRejected.title",
        bodyKey: decision === "approve" ? "notice.auctionApproved.body" : "notice.auctionRejected.body",
        params: { title: String(snapshot.get("title") ?? "Auction"), note }, createdAt: serverTimestamp(), readAt: null,
      });
    }
  });
  return { status: decision };
});

export const publishAuction = onCall(CALLABLE_OPTIONS, async (request) => {
  const caller = await requireAdmin(request);
  const auctionId = text(request.data.auctionId, "Auction ID", 128, 5);
  const auctionRef = db.doc(`auctions/${auctionId}`);
  const productRef = db.doc(`products/${auctionId}`);
  let nextStatus = "published";
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(auctionRef);
    if (!snapshot.exists) throw new HttpsError("not-found", "Auction not found.");
    if (!["draft", "pending_review", "rejected"].includes(String(snapshot.get("status")))) throw new HttpsError("failed-precondition", "This auction cannot be published from its current state.");
    const startsAt = millisFromFirestore(snapshot.get("startsAt"));
    const endsAt = millisFromFirestore(snapshot.get("endsAt"));
    if (endsAt <= Date.now() || startsAt >= endsAt) throw new HttpsError("failed-precondition", "Auction schedule is invalid or has already ended.");
    nextStatus = publicationStatus(startsAt);
    tx.update(auctionRef, { status: nextStatus, publishedBy: caller.uid, publishedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    tx.set(productRef, { status: nextStatus, updatedAt: serverTimestamp() }, { merge: true });
    writeAuditInTransaction(tx, caller.uid, "auction.published", "auction", auctionId);
  });
  return { status: nextStatus };
});

export const closeAuctionForEditing = onCall(CALLABLE_OPTIONS, async (request) => {
  const caller = await requireAdmin(request);
  const auctionId = text(request.data.auctionId, "Auction ID", 128, 5);
  const auctionRef = db.doc(`auctions/${auctionId}`);
  const productRef = db.doc(`products/${auctionId}`);
  await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(auctionRef);
    if (!snapshot.exists) throw new HttpsError("not-found", "Auction not found.");
    const status = String(snapshot.get("status"));
    if (!["published", "live"].includes(status)) throw new HttpsError("failed-precondition", "Only a published or live auction can be closed for editing.");
    if (millisFromFirestore(snapshot.get("endsAt")) <= Date.now()) throw new HttpsError("failed-precondition", "An auction whose scheduled end time has passed cannot be reopened for editing.");
    if (Number(snapshot.get("bidCount") ?? 0) !== 0) throw new HttpsError("failed-precondition", "An auction with accepted bids cannot be edited.");
    tx.update(auctionRef, { status: "closed", closedForEditing: true, closedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    tx.set(productRef, { status: "closed", updatedAt: serverTimestamp() }, { merge: true });
    writeAuditInTransaction(tx, caller.uid, "auction.closed_for_editing", "auction", auctionId);
  });
  return { status: "closed" };
});

export const updateAuction = onCall(CALLABLE_OPTIONS, async (request) => {
  const caller = await requireOwnerOrAdmin(request);
  const data = request.data;
  const auctionId = text(data.auctionId, "Auction ID", 128, 5);
  const title = text(data.title, "Title", 220, 4);
  const category = text(data.category, "Category", 80, 2);
  const description = text(data.description, "Description", 5000, 20);
  const sellerName = text(data.sellerName, "Seller name", 100, 2);
  const bidFee = finiteNumber(data.bidFee, "Bid fee", 0, 1000000);
  const minBid = finiteNumber(data.minBid, "Minimum bid", 0.01, 10000000);
  const maxBid = finiteNumber(data.maxBid, "Maximum bid", minBid, 10000000);
  const maxBidsPerUser = finiteNumber(data.maxBidsPerUser, "Maximum bids per user", 1, 100);
  if (!Number.isInteger(maxBidsPerUser)) throw new HttpsError("invalid-argument", "Maximum bids per user must be a whole number.");
  const startsAtMs = millis(data.startsAtMs, "Opening time");
  const endsAtMs = millis(data.endsAtMs, "Closing time");
  if (startsAtMs <= Date.now() - 60_000 || endsAtMs <= startsAtMs) {
    throw new HttpsError("invalid-argument", "Closing time must be after the opening time, and the opening time cannot be in the past.");
  }

  const auctionRef = db.doc(`auctions/${auctionId}`);
  const productRef = db.doc(`products/${auctionId}`);
  const imageRef = db.doc(`auctionImages/${auctionId}`);
  const existing = await auctionRef.get();
  if (!existing.exists) throw new HttpsError("not-found", "Auction not found.");
  if (existing.get("ownerUid") !== caller.uid && caller.token.admin !== true) throw new HttpsError("permission-denied", "You do not own this listing.");
  if (!["draft", "rejected", "closed"].includes(String(existing.get("status")))) throw new HttpsError("failed-precondition", "Close the auction before editing it.");
  if (Number(existing.get("bidCount") ?? 0) !== 0) throw new HttpsError("failed-precondition", "An auction with accepted bids cannot be edited.");

  const image = data.imageDataUrl === undefined ? null : validateFirestoreJpeg(data.imageDataUrl, "Product image");
  const imagePath = `firestore-image:${auctionId}`;
  if (!image && String(existing.get("imagePath") ?? "") !== imagePath) {
    throw new HttpsError("failed-precondition", "Choose a new image to move this older listing into Firestore image storage.");
  }
  if (!image && !(await imageRef.get()).exists) {
    throw new HttpsError("failed-precondition", "Choose a replacement image; the existing Firestore image is missing.");
  }

  await db.runTransaction(async (tx) => {
    const current = await tx.get(auctionRef);
    if (!current.exists) throw new HttpsError("not-found", "Auction not found.");
    if (current.get("ownerUid") !== caller.uid && caller.token.admin !== true) throw new HttpsError("permission-denied", "You do not own this listing.");
    if (!["draft", "rejected", "closed"].includes(String(current.get("status")))) throw new HttpsError("failed-precondition", "Close the auction before editing it.");
    if (Number(current.get("bidCount") ?? 0) !== 0) throw new HttpsError("failed-precondition", "An auction with accepted bids cannot be edited.");
    const fields = {
      title, category, description, sellerName, imagePath, imageStoragePath: FieldValue.delete(), bidFee, minBid, maxBid, maxBidsPerUser,
      startsAt: Timestamp.fromMillis(startsAtMs), endsAt: Timestamp.fromMillis(endsAtMs),
      status: "draft", closedForEditing: false, reviewNote: null,
      closedAt: FieldValue.delete(), publishedAt: FieldValue.delete(), publishedBy: FieldValue.delete(), updatedAt: serverTimestamp(),
    };
    if (image) tx.set(imageRef, { auctionId, ownerUid: String(current.get("ownerUid") ?? caller.uid), imageDataUrl: image.dataUrl, contentType: "image/jpeg", byteLength: image.byteLength, updatedAt: serverTimestamp() }, { merge: true });
    tx.update(auctionRef, fields);
    tx.set(productRef, { title, category, description, sellerName, imagePath, imageStoragePath: FieldValue.delete(), status: "draft", updatedAt: serverTimestamp() }, { merge: true });
    writeAuditInTransaction(tx, caller.uid, "auction.edited_as_draft", "auction", auctionId);
  });
  return { auctionId, status: "draft" };
});

export const placeBid = onCall(CALLABLE_OPTIONS, async (request) => {
  const caller = await requireUser(request);
  if (caller.token.admin === true) throw new HttpsError("permission-denied", "Administrator accounts cannot place bids.");
  const auctionId = text(request.data.auctionId, "Auction ID", 128, 5);
  const amountCents = centsFromInput(request.data.amount);
  const paymentId = typeof request.data.paymentId === "string" ? request.data.paymentId.trim() : "";
  const auctionRef = db.doc(`auctions/${auctionId}`);
  const counterRef = db.doc(`auctions/${auctionId}/bidderCounters/${caller.uid}`);
  const amountRef = db.doc(`auctions/${auctionId}/amountCounts/${amountCents}`);
  const rateRef = db.doc(`rateLimits/${caller.uid}`);
  const paymentRef = paymentId ? db.doc(`users/${caller.uid}/payments/${paymentId}`) : null;
  const bidRef = db.collection(`users/${caller.uid}/bids`).doc();
  const entryRef = db.doc(`auctions/${auctionId}/entries/${bidRef.id}`);
  const notificationRef = db.doc(`users/${caller.uid}/notifications/${bidRef.id}`);
  const now = Date.now();

  await db.runTransaction(async (tx) => {
    const [auctionSnap, counterSnap, amountSnap, rateSnap, paymentSnap] = await Promise.all([
      tx.get(auctionRef), tx.get(counterRef), tx.get(amountRef), tx.get(rateRef),
      paymentRef ? tx.get(paymentRef) : Promise.resolve(null),
    ]);
    if (!auctionSnap.exists) throw new HttpsError("not-found", "Auction not found.");
    const auction = auctionSnap.data()!;
    if (auction.status !== "live" || millisFromFirestore(auction.startsAt) > now || millisFromFirestore(auction.endsAt) <= now) {
      throw new HttpsError("failed-precondition", "This auction is not accepting bids right now.");
    }
    const minCents = Math.round(Number(auction.minBid) * 100);
    const maxCents = Math.round(Number(auction.maxBid) * 100);
    if (amountCents < minCents || amountCents > maxCents) throw new HttpsError("invalid-argument", `Bid must be between ${(minCents / 100).toFixed(2)} and ${(maxCents / 100).toFixed(2)} ETB.`);
    const nextCount = Number(counterSnap.get("count") ?? 0) + 1;
    if (nextCount > Number(auction.maxBidsPerUser ?? 10)) throw new HttpsError("resource-exhausted", "You have reached this auction's bid limit.");
    if (Number(auction.bidFee ?? 0) > 0) {
      if (!paymentSnap?.exists || paymentSnap.get("status") !== "paid" || paymentSnap.get("used") === true
        || paymentSnap.get("auctionId") !== auctionId || Math.round(Number(paymentSnap.get("amount")) * 100) !== Math.round(Number(auction.bidFee) * 100)) {
        throw new HttpsError("failed-precondition", "An administrator-verified, unused payment for this auction is required.");
      }
    }
    const rate = rateSnap.data() ?? {};
    const minuteBucket = Math.floor(now / 60_000);
    const rateCount = Number(rate.minuteBucket) === minuteBucket ? Number(rate.count ?? 0) + 1 : 1;
    if (rateCount > 20) throw new HttpsError("resource-exhausted", "Too many bid attempts. Please wait a minute and try again.");

    if (paymentRef) tx.update(paymentRef, { used: true, usedAt: FieldValue.serverTimestamp(), bidId: bidRef.id });
    tx.set(counterRef, { uid: caller.uid, count: nextCount, lastBidId: bidRef.id, updatedAt: FieldValue.serverTimestamp() });
    tx.set(amountRef, { amountCents, count: Number(amountSnap.get("count") ?? 0) + 1, updatedAt: FieldValue.serverTimestamp() });
    tx.set(rateRef, { minuteBucket, count: rateCount, updatedAt: FieldValue.serverTimestamp() });
    tx.update(auctionRef, { bidCount: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() });
    tx.create(bidRef, {
      uid: caller.uid, auctionId, amount: amountCents / 100, amountCents, paymentId: paymentRef ? paymentId : null,
      auctionTitle: String(auction.title ?? "Auction"), auctionImagePath: String(auction.imagePath ?? ""),
      auctionStatus: "live", isWinningBid: false, createdAt: FieldValue.serverTimestamp(),
    });
    tx.create(entryRef, { uid: caller.uid, bidId: bidRef.id, auctionId, amount: amountCents / 100, amountCents, createdAt: FieldValue.serverTimestamp() });
    tx.create(notificationRef, {
      type: "bid_accepted", titleKey: "notice.bidAccepted.title", bodyKey: "notice.bidAccepted.body",
      params: { title: String(auction.title ?? "Auction"), amount: (amountCents / 100).toFixed(2) },
      createdAt: FieldValue.serverTimestamp(), readAt: null,
    });
    writeAuditInTransaction(tx, caller.uid, "bid.accepted", "auction", auctionId);
  });
  return { bidId: bidRef.id, amount: amountCents / 100 };
});

function maskPhone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const phone = value.trim();
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 7) return null;
  return `${phone.slice(0, Math.max(0, phone.length - 4)).replace(/\d/g, "•")}••••${digits.slice(-4)}`;
}

async function finalizeAuction(auctionId: string, actorUid: string, allowEarly = false) {
  const auctionRef = db.doc(`auctions/${auctionId}`);
  const resultRef = db.doc(`results/${auctionId}`);
  const claim = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(auctionRef);
    if (!snapshot.exists) throw new HttpsError("not-found", "Auction not found.");
    if (snapshot.get("status") === "completed") return { continue: false, alreadyDone: true };
    if (snapshot.get("status") === "live") {
      if (!allowEarly && millisFromFirestore(snapshot.get("endsAt")) > Date.now()) {
        throw new HttpsError("failed-precondition", "An auction can only be finalized after its scheduled end time.");
      }
      tx.update(auctionRef, { status: "calculating", calculatingAt: serverTimestamp(), updatedAt: serverTimestamp() });
      return { continue: true, alreadyDone: false };
    }
    if (snapshot.get("status") === "calculating") return { continue: true, alreadyDone: false };
    throw new HttpsError("failed-precondition", "Only a live, ended auction can be finalized.");
  });
  if (!claim.continue) {
    const oldResult = await resultRef.get();
    return { resultType: oldResult.get("resultType") ?? "no_unique_bid", referenceCode: oldResult.get("referenceCode") ?? "", alreadyCompleted: true };
  }

  const countsSnapshot = await db.collection(`auctions/${auctionId}/amountCounts`).get();
  const counts = countsSnapshot.docs.map((item) => ({ amountCents: Number(item.get("amountCents")), count: Number(item.get("count")) }));
  const validBidCount = counts.reduce((sum, item) => sum + (Number.isFinite(item.count) ? item.count : 0), 0);
  const winningCents = selectLowestUniqueAmount(counts);
  let winnerUid: string | null = null;
  let winnerBidId: string | null = null;
  let winnerProfile: FirebaseFirestore.DocumentData | undefined;
  let winnerBidRef: FirebaseFirestore.DocumentReference | null = null;
  if (winningCents !== null) {
    const winnerEntries = await db.collection(`auctions/${auctionId}/entries`).where("amountCents", "==", winningCents).limit(2).get();
    if (winnerEntries.size !== 1) throw new HttpsError("data-loss", "The auction's bid count records do not match its bid entries.");
    winnerUid = String(winnerEntries.docs[0].get("uid") ?? "");
    winnerBidId = String(winnerEntries.docs[0].get("bidId") ?? winnerEntries.docs[0].id);
    if (!winnerUid) throw new HttpsError("data-loss", "The winning bid has no bidder reference.");
    winnerBidRef = db.doc(`users/${winnerUid}/bids/${winnerBidId}`);
    const [profileSnap] = await Promise.all([db.doc(`users/${winnerUid}`).get()]);
    winnerProfile = profileSnap.data();
  }

  const auctionSnapshot = await auctionRef.get();
  if (!auctionSnapshot.exists) throw new HttpsError("not-found", "Auction not found.");
  const auction = auctionSnapshot.data()!;
  const sortedCounts = [...counts].sort((a, b) => a.amountCents - b.amountCents).map((item) => `${item.amountCents}:${item.count}`).join("|");
  const resultHash = createHash("sha256").update(`cherta-result-v1|${auctionId}|${validBidCount}|${sortedCounts}`).digest("hex");
  const referenceCode = `CH-${auctionId.slice(0, 8).toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`;
  const resultType = winningCents === null ? "no_unique_bid" : "winner";
  const resultData = {
    auctionId, title: String(auction.title ?? "Auction"), category: String(auction.category ?? "Other"),
    imagePath: String(auction.imagePath ?? ""), resultType, winningAmount: winningCents === null ? null : winningCents / 100,
    winnerName: winningCents === null ? "No winner declared" : String(winnerProfile?.name ?? "Winner"),
    maskedPhone: winningCents === null ? null : maskPhone(winnerProfile?.phone), validBidCount,
    referenceCode, resultHash, publishedAt: FieldValue.serverTimestamp(),
  };
  const auditRef = db.collection("auditLogs").doc();
  const notificationRef = winnerUid ? db.doc(`users/${winnerUid}/notifications/auction-${auctionId}-result`) : null;
  const winRef = winnerUid ? db.doc(`users/${winnerUid}/wins/${auctionId}`) : null;
  await db.runTransaction(async (tx) => {
    const [currentAuction, existingResult, winnerBid] = await Promise.all([
      tx.get(auctionRef), tx.get(resultRef), winnerBidRef ? tx.get(winnerBidRef) : Promise.resolve(null),
    ]);
    if (existingResult.exists) return;
    if (!currentAuction.exists || currentAuction.get("status") !== "calculating") {
      throw new HttpsError("aborted", "Auction finalization is already being handled elsewhere.");
    }
    tx.create(resultRef, resultData);
    tx.update(auctionRef, { status: "completed", resultHash, resultReferenceCode: referenceCode, completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    if (winnerBidRef && winnerBid?.exists) tx.update(winnerBidRef, { isWinningBid: true, auctionStatus: "completed", resultHash });
    if (winRef && winnerUid && winnerBidId) tx.create(winRef, {
      auctionId, bidId: winnerBidId, amount: winningCents! / 100, title: String(auction.title ?? "Auction"),
      imagePath: String(auction.imagePath ?? ""), referenceCode, resultHash, createdAt: FieldValue.serverTimestamp(),
    });
    if (notificationRef) tx.create(notificationRef, {
      type: "auction_result", titleKey: "notice.auctionResult.title", bodyKey: "notice.auctionResult.body",
      params: { title: String(auction.title ?? "Auction"), result: resultType === "winner" ? "winner" : "no_unique_bid", amount: winningCents === null ? "" : (winningCents / 100).toFixed(2) },
      createdAt: FieldValue.serverTimestamp(), readAt: null,
    });
    tx.create(auditRef, {
      actorUid: actorUid || "system", action: "auction.result_published", entityType: "auction", entityId: auctionId,
      resultHash, referenceCode, createdAt: FieldValue.serverTimestamp(),
    });
  });
  return { resultType, referenceCode, winningAmount: winningCents === null ? null : winningCents / 100, validBidCount, resultHash };
}

export const finalizeAuctionNow = onCall(CALLABLE_OPTIONS, async (request) => {
  const caller = requireCaller(request);
  await requireActive(caller.uid);
  const auctionId = text(request.data.auctionId, "Auction ID", 128, 5);
  const auction = await db.doc(`auctions/${auctionId}`).get();
  if (!auction.exists) throw new HttpsError("not-found", "Auction not found.");
  await requireOwnerOrAdmin(request, String(auction.get("ownerUid") ?? ""));
  return finalizeAuction(auctionId, caller.uid);
});

export const processAuctionLifecycle = onSchedule({ schedule: "every 1 minutes", timeZone: "UTC", maxInstances: 1 }, async () => {
  const now = Timestamp.now();
  const dueToStart = await db.collection("auctions").where("status", "==", "published").where("startsAt", "<=", now).limit(50).get();
  await Promise.allSettled(dueToStart.docs.map(async (item) => {
    await db.runTransaction(async (tx) => {
      const current = await tx.get(item.ref);
      if (!current.exists || current.get("status") !== "published") return;
      if (millisFromFirestore(current.get("startsAt")) > Date.now()) return;
      tx.update(item.ref, { status: "live", updatedAt: serverTimestamp() });
      tx.set(db.doc(`products/${item.id}`), { status: "live", updatedAt: serverTimestamp() }, { merge: true });
    });
  }));
  const dueToEnd = await db.collection("auctions").where("status", "==", "live").where("endsAt", "<=", now).limit(50).get();
  await Promise.allSettled(dueToEnd.docs.map((item) => finalizeAuction(item.id, "system").catch((error: unknown) => {
    console.error(`[auction-lifecycle] Could not finalize ${item.id}`, error);
  })));
});
