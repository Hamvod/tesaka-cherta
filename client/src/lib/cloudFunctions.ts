import { httpsCallable } from "firebase/functions";
import { getDownloadURL, ref, uploadBytesResumable, type UploadTaskSnapshot } from "firebase/storage";
import { functions, storage } from "./firebase";

function callable<Input extends Record<string, unknown>, Output>(name: string) {
  const invoke = httpsCallable<Input, Output>(functions, name);
  return async (payload: Input): Promise<Output> => (await invoke(payload)).data;
}

export type CreateAuctionInput = {
  title: string;
  category: string;
  description: string;
  sellerName: string;
  imagePath: string;
  imageStoragePath: string;
  bidFee: number;
  minBid: number;
  maxBid: number;
  maxBidsPerUser: number;
  startsAtMs: number;
  endsAtMs: number;
};

export type UpdateAuctionInput = Omit<CreateAuctionInput, "imagePath" | "imageStoragePath"> & {
  auctionId: string;
  imagePath?: string;
  imageStoragePath?: string;
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
export const submitPaymentProofCall = callable<{ auctionId: string; provider: string; providerReference?: string; proofStoragePath?: string; ocrText?: string }, { paymentId: string; status: "pending"; ocrStatusHint: string }>("submitPaymentProof");
export const reviewPaymentProofCall = callable<{ uid: string; paymentId: string; decision: "paid" | "failed"; note?: string }, { uid: string; paymentId: string; status: string }>("reviewPaymentProof");
export const reviewReportCall = callable<{ reportId: string; status: "open" | "reviewing" | "resolved" | "dismissed"; adminNotes: string | null; adminReply: string | null }, { reportId: string; status: string }>("reviewReport");
export const setUserStatusCall = callable<{ uid: string; status: "active" | "suspended" }, { uid: string; status: string }>("setUserStatus");
export const submitSupportReportCall = callable<{ category: string; subject: string; details: string; targetType?: string | null; targetId?: string | null }, { reportId: string; status: string }>("submitSupportReport");

export type ProductImageUpload = { imagePath: string; imageStoragePath: string };

export function uploadProductImage(uid: string, file: File, onProgress?: (percent: number) => void): Promise<ProductImageUpload> {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) return Promise.reject(new Error("Choose a JPEG, PNG, or WebP image."));
  if (file.size <= 0 || file.size > 5 * 1024 * 1024) return Promise.reject(new Error("Product images must be no larger than 5 MB."));
  const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
  const imageStoragePath = `product-images/${uid}/${crypto.randomUUID()}.${extension}`;
  const task = uploadBytesResumable(ref(storage, imageStoragePath), file, { contentType: file.type, cacheControl: "public,max-age=31536000,immutable" });
  return new Promise((resolve, reject) => {
    task.on("state_changed", (snapshot: UploadTaskSnapshot) => {
      onProgress?.(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
    }, reject, async () => {
      try {
        resolve({ imagePath: await getDownloadURL(task.snapshot.ref), imageStoragePath });
      } catch (error) {
        reject(error);
      }
    });
  });
}

export function uploadPaymentReceipt(uid: string, file: File, onProgress?: (percent: number) => void): Promise<{ proofStoragePath: string }> {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  if (!allowed.includes(file.type)) return Promise.reject(new Error("Choose a JPEG, PNG, or WebP receipt image."));
  if (file.size <= 0 || file.size > 5 * 1024 * 1024) return Promise.reject(new Error("Receipt images must be no larger than 5 MB."));
  const extension = file.type === "image/jpeg" ? "jpg" : file.type === "image/png" ? "png" : "webp";
  const proofStoragePath = `payment-receipts/${uid}/${crypto.randomUUID()}.${extension}`;
  const task = uploadBytesResumable(ref(storage, proofStoragePath), file, { contentType: file.type, cacheControl: "private,max-age=0,no-cache" });
  return new Promise((resolve, reject) => {
    task.on("state_changed", (snapshot: UploadTaskSnapshot) => {
      onProgress?.(Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100));
    }, reject, () => resolve({ proofStoragePath }));
  });
}

export function getPaymentReceiptURL(proofStoragePath: string): Promise<string> {
  return getDownloadURL(ref(storage, proofStoragePath));
}
