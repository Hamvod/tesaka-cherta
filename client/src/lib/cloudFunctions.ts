import { httpsCallable } from "firebase/functions";
import { functions } from "./firebase";

function callable<Input extends Record<string, unknown>, Output>(name: string) {
  const invoke = httpsCallable<Input, Output>(functions, name);
  return async (payload: Input): Promise<Output> => {
    try {
      return (await invoke(payload)).data;
    } catch (error) {
      const record = error && typeof error === "object" ? error as { code?: unknown; message?: unknown } : null;
      const code = typeof record?.code === "string" ? record.code.toLowerCase() : "";
      const message = typeof record?.message === "string" ? record.message.trim() : "";
      console.error(`[Firebase callable: ${name}]`, error);
      if (/^(?:functions\/)?internal(?:\[0\])?$/.test(code) || /^internal(?:\[0\])?$/i.test(message)) {
        const paymentWarning = /payment|bid/i.test(name) ? " Your payment or bid has not been confirmed." : " Please check the latest state before retrying.";
        throw new Error(`The server returned an unexpected internal error while running ${name}.${paymentWarning} Please retry; if this continues, contact the administrator and mention “${name}”.`);
      }
      throw error;
    }
  };
}

export type CreateAuctionInput = {
  title: string;
  category: string;
  description: string;
  sellerName: string;
  imageDataUrl: string;
  bidFee: number;
  minBid: number;
  maxBid: number;
  maxBidsPerUser: number;
  startsAtMs: number;
  endsAtMs: number;
};

export type UpdateAuctionInput = Omit<CreateAuctionInput, "imageDataUrl"> & {
  auctionId: string;
  imageDataUrl?: string;
};

export const createAuctionCall = callable<CreateAuctionInput, { auctionId: string; status: string }>("createAuction");
export const updateAuctionCall = callable<UpdateAuctionInput, { auctionId: string; status: string }>("updateAuction");
export const closeAuctionForEditingCall = callable<{ auctionId: string }, { status: string }>("closeAuctionForEditing");
export const submitAuctionForReviewCall = callable<{ auctionId: string }, { status: string }>("submitAuctionForReview");
export const reviewAuctionCall = callable<{ auctionId: string; decision: "approve" | "reject"; note?: string }, { status: string }>("reviewAuction");
export const publishAuctionCall = callable<{ auctionId: string }, { status: string }>("publishAuction");
export const placeBidCall = callable<{ auctionId: string; amount: number; paymentId?: string }, { bidId: string; amount: number }>("placeBid");
export const finalizeAuctionCall = callable<{ auctionId: string }, { resultType: string; referenceCode: string; winningAmount?: number | null; validBidCount?: number; resultHash?: string; alreadyCompleted?: boolean }>("finalizeAuctionNow");
export const requestOwnerAccessCall = callable<{ businessName: string; city: string; contactPhone: string; description: string }, { status: string }>("requestOwnerAccess");
export const reviewOwnerApplicationCall = callable<{ uid: string; decision: "approve" | "reject"; note?: string }, { status: string; uid: string }>("reviewOwnerApplication");
export const recordManualPaymentCall = callable<{ uid: string; auctionId: string; providerReference: string; status: "pending" | "paid" }, { paymentId: string; status: string }>("recordManualPayment");
export const submitPaymentProofCall = callable<{ auctionId: string; provider: string; providerReference?: string; proofImageDataUrl?: string; ocrText?: string }, { paymentId: string; status: "pending"; ocrStatusHint: string }>("submitPaymentProof");
export const reviewPaymentProofCall = callable<{ uid: string; paymentId: string; decision: "paid" | "failed"; note?: string }, { uid: string; paymentId: string; status: string }>("reviewPaymentProof");
export const reviewReportCall = callable<{ reportId: string; status: "open" | "reviewing" | "resolved" | "dismissed"; adminNotes: string | null; adminReply: string | null }, { reportId: string; status: string }>("reviewReport");
export const setUserStatusCall = callable<{ uid: string; status: "active" | "suspended" }, { uid: string; status: string }>("setUserStatus");
export const submitSupportReportCall = callable<{ category: string; subject: string; details: string; targetType?: string | null; targetId?: string | null }, { reportId: string; status: string }>("submitSupportReport");
