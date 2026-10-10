/**
 * Frontend-only action adapter.
 *
 * The deployable backend was intentionally removed from this repository. These
 * functions keep the existing UI contracts stable for preview mode and record
 * user actions locally so the app remains usable without a server.
 *
 * Secure writes (bids, admin decisions, payments) must be connected to a
 * trusted Firebase backend before production use. Firebase Auth and Firestore
 * reads remain available in the browser through firebaseData.ts.
 */

type AnyPayload = Record<string, unknown>;
type ActionResult = Record<string, unknown>;

const ACTIONS_KEY = "tesaka-cherta-preview-actions";

function remember(name: string, payload: AnyPayload): ActionResult {
  const id = typeof window !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}`;
  if (typeof window !== "undefined") {
    const existing = JSON.parse(localStorage.getItem(ACTIONS_KEY) || "[]") as Array<Record<string, unknown>>;
    existing.push({ id, name, payload, createdAt: new Date().toISOString() });
    localStorage.setItem(ACTIONS_KEY, JSON.stringify(existing.slice(-100)));
    window.dispatchEvent(new CustomEvent("cherta:action", { detail: { name, payload } }));
  }
  const result: ActionResult = { status: "preview_recorded", ...payload };
  if (name === "createAuction") result.auctionId = id;
  if (name === "placeBid") result.bidId = id;
  if (name === "submitPaymentProof" || name === "recordManualPayment") result.paymentId = id;
  if (name === "submitSupportReport") result.reportId = id;
  if (name === "reviewOwnerApplication") result.uid = payload.uid;
  return result;
}

function callable<Input extends AnyPayload, Output extends ActionResult>(name: string) {
  return async (payload: Input): Promise<Output> => remember(name, payload) as Output;
}

export type CreateAuctionInput = {
  title: string; category: string; description: string; sellerName: string; imageDataUrl: string;
  bidFee: number; minBid: number; maxBid: number; maxBidsPerUser: number; startsAtMs: number; endsAtMs: number;
};
export type UpdateAuctionInput = Omit<CreateAuctionInput, "imageDataUrl"> & { auctionId: string; imageDataUrl?: string };

export const createAuctionCall = callable<CreateAuctionInput, { auctionId: string; status: string }>("createAuction");
export const updateAuctionCall = callable<UpdateAuctionInput, { auctionId: string; status: string }>("updateAuction");
export const deleteAuctionCall = callable<{ auctionId: string }, { auctionId: string; status: string }>("deleteAuction");
export const closeAuctionForEditingCall = callable<{ auctionId: string }, { status: string }>("closeAuctionForEditing");
export const submitAuctionForReviewCall = callable<{ auctionId: string }, { status: string }>("submitAuctionForReview");
export const reviewAuctionCall = callable<{ auctionId: string; decision: "approve" | "reject"; note?: string }, { status: string }>("reviewAuction");
export const publishAuctionCall = callable<{ auctionId: string }, { status: string }>("publishAuction");
export const placeBidCall = callable<{ auctionId: string; amount: number; paymentId?: string }, { bidId: string; amount: number }>("placeBid");
export const finalizeAuctionCall = callable<{ auctionId: string }, { resultType: string; referenceCode: string; winningAmount?: number | null; validBidCount?: number; resultHash?: string; alreadyCompleted?: boolean }>("finalizeAuctionNow");
export const requestOwnerAccessCall = callable<{ businessName: string; city: string; contactPhone: string; description: string }, { status: string }>("requestOwnerAccess");
export const reviewOwnerApplicationCall = callable<{ uid: string; decision: "approve" | "reject"; note?: string }, { status: string; uid: string }>("reviewOwnerApplication");
export const recordManualPaymentCall = callable<{ uid: string; auctionId: string; providerReference: string; status: "pending" | "paid" }, { paymentId: string; status: string }>("recordManualPayment");
export const submitPaymentProofCall = callable<{ auctionId: string; provider: string; providerReference?: string; proofImageDataUrl?: string }, { paymentId: string; status: "pending" }>("submitPaymentProof");
export const reviewPaymentProofCall = callable<{ uid: string; paymentId: string; decision: "paid" | "failed"; note?: string }, { uid: string; paymentId: string; status: string }>("reviewPaymentProof");
export const reviewReportCall = callable<{ reportId: string; status: "open" | "reviewing" | "resolved" | "dismissed"; adminNotes: string | null; adminReply: string | null }, { reportId: string; status: string }>("reviewReport");
export const setUserStatusCall = callable<{ uid: string; status: "active" | "suspended" }, { uid: string; status: string }>("setUserStatus");
export const submitSupportReportCall = callable<{ category: string; subject: string; details: string; targetType?: string | null; targetId?: string | null }, { reportId: string; status: string }>("submitSupportReport");
