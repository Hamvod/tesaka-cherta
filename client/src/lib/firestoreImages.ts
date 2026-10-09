import { doc, getDoc } from "firebase/firestore";
import { firestore } from "./firebase";

export const FIRESTORE_IMAGE_PREFIX = "firestore-image:";
export const MAX_FIRESTORE_IMAGE_BYTES = 300 * 1024;
const MAX_SOURCE_IMAGE_BYTES = 12 * 1024 * 1024;
const INPUT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function firestoreImagePath(auctionId: string): string {
  return `${FIRESTORE_IMAGE_PREFIX}${auctionId}`;
}

export function firestoreImageId(imagePath: string): string | null {
  return imagePath.startsWith(FIRESTORE_IMAGE_PREFIX) ? imagePath.slice(FIRESTORE_IMAGE_PREFIX.length) : null;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not prepare image for Firestore."));
    reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("Could not encode image."));
    reader.readAsDataURL(blob);
  });
}

function canvasToJpeg(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Your browser could not compress this image.")), "image/jpeg", quality);
  });
}

/** Converts a supported image to a bounded JPEG data URL for a Firestore image document. */
export async function compressImageForFirestore(file: File): Promise<string> {
  if (!INPUT_TYPES.has(file.type)) throw new Error("Choose a JPEG, PNG, or WebP image.");
  if (file.size <= 0 || file.size > MAX_SOURCE_IMAGE_BYTES) throw new Error("The source image must be no larger than 12 MB.");

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("This image could not be opened. Choose another JPEG, PNG, or WebP file.");
  }

  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 80_000_000) {
      throw new Error("The image dimensions are too large to process safely.");
    }
    let scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Image compression is not available in this browser.");

    for (let resizeAttempt = 0; resizeAttempt < 8; resizeAttempt += 1) {
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

      for (const quality of [0.86, 0.76, 0.66, 0.56, 0.46, 0.36]) {
        const blob = await canvasToJpeg(canvas, quality);
        if (blob.size <= MAX_FIRESTORE_IMAGE_BYTES) return await blobToDataUrl(blob);
      }
      scale *= 0.78;
    }
    throw new Error("This image cannot be compressed below the Firestore image limit. Choose a smaller image.");
  } finally {
    bitmap.close();
  }
}

export async function getAuctionImageData(imagePath: string): Promise<string | null> {
  const id = firestoreImageId(imagePath);
  if (!id) return null;
  const snapshot = await getDoc(doc(firestore, "auctionImages", id));
  const value = snapshot.data()?.imageDataUrl;
  return typeof value === "string" && value.startsWith("data:image/jpeg;base64,") ? value : null;
}

export async function getPaymentProofImageData(uid: string, paymentId: string): Promise<string | null> {
  const snapshot = await getDoc(doc(firestore, "users", uid, "payments", paymentId, "proofs", "receipt"));
  const value = snapshot.data()?.imageDataUrl;
  return typeof value === "string" && value.startsWith("data:image/jpeg;base64,") ? value : null;
}
