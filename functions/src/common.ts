import { FieldValue, getFirestore, Timestamp, type DocumentReference, type Transaction } from "firebase-admin/firestore";
import type { CallableRequest } from "firebase-functions/v2/https";
import { HttpsError } from "firebase-functions/v2/https";

export const db = getFirestore();
export const CALLABLE_OPTIONS = { cors: ["https://tesaka-cherta.vercel.app", "http://localhost:5173"] };
export const serverTimestamp = () => FieldValue.serverTimestamp();
export type CallRequest = CallableRequest<Record<string, unknown>>;
export type Caller = NonNullable<CallRequest["auth"]>;

export function requireCaller(request: CallRequest): Caller {
  if (!request.auth) throw new HttpsError("unauthenticated", "Sign in to continue.");
  return request.auth;
}

export async function requireActive(uid: string): Promise<void> {
  const profile = await db.doc(`users/${uid}`).get();
  if (profile.exists && profile.get("status") === "suspended") {
    throw new HttpsError("permission-denied", "This account is suspended.");
  }
}

export async function requireAdmin(request: CallRequest): Promise<Caller> {
  const caller = requireCaller(request);
  await requireActive(caller.uid);
  if (caller.token.admin !== true) throw new HttpsError("permission-denied", "Administrator access is required.");
  return caller;
}

export async function requireOwnerOrAdmin(request: CallRequest, ownerUid?: string): Promise<Caller> {
  const caller = requireCaller(request);
  await requireActive(caller.uid);
  if (caller.token.admin === true) return caller;
  if (caller.token.owner !== true || (ownerUid && caller.uid !== ownerUid)) {
    throw new HttpsError("permission-denied", "Verified owner access is required.");
  }
  const profile = await db.doc(`users/${caller.uid}`).get();
  if (!profile.exists || profile.get("ownerStatus") !== "approved") {
    throw new HttpsError("permission-denied", "Your owner access is not approved.");
  }
  return caller;
}

export async function requireUser(request: CallRequest): Promise<Caller> {
  const caller = requireCaller(request);
  await requireActive(caller.uid);
  return caller;
}

export function text(value: unknown, field: string, maxLength: number, minLength = 1): string {
  if (typeof value !== "string") throw new HttpsError("invalid-argument", `${field} must be text.`);
  const clean = value.trim();
  if (clean.length < minLength || clean.length > maxLength) {
    throw new HttpsError("invalid-argument", `${field} must be between ${minLength} and ${maxLength} characters.`);
  }
  return clean;
}

export function finiteNumber(value: unknown, field: string, min: number, max: number): number {
  const number = typeof value === "string" ? Number(value) : value;
  if (typeof number !== "number" || !Number.isFinite(number) || number < min || number > max) {
    throw new HttpsError("invalid-argument", `${field} is outside the allowed range.`);
  }
  return number;
}

export function millis(value: unknown, field: string): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) throw new HttpsError("invalid-argument", `${field} is not a valid date.`);
  return parsed;
}

const MAX_FIRESTORE_IMAGE_BYTES = 300 * 1024;

function jpegDimensions(bytes: Buffer): { width: number; height: number } | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) { offset += 1; continue; }
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (offset + 2 > bytes.length) return null;
    const segmentLength = bytes.readUInt16BE(offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    if (startOfFrame.has(marker)) {
      if (segmentLength < 8) return null;
      return { height: bytes.readUInt16BE(offset + 3), width: bytes.readUInt16BE(offset + 5) };
    }
    offset += segmentLength;
  }
  return null;
}

export function validateFirestoreJpeg(value: unknown, field = "Image"): { dataUrl: string; byteLength: number } {
  if (typeof value !== "string" || value.length > 420_000) {
    throw new HttpsError("invalid-argument", `${field} must be a compressed JPEG no larger than 300 KiB.`);
  }
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[1].length % 4 !== 0) throw new HttpsError("invalid-argument", `${field} must be a valid JPEG image.`);
  const bytes = Buffer.from(match[1], "base64");
  if (bytes.length === 0 || bytes.length > MAX_FIRESTORE_IMAGE_BYTES || bytes.toString("base64") !== match[1]) {
    throw new HttpsError("invalid-argument", `${field} must be a valid JPEG no larger than 300 KiB.`);
  }
  const dimensions = jpegDimensions(bytes);
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0 || dimensions.width > 4096 || dimensions.height > 4096 || dimensions.width * dimensions.height > 16_000_000) {
    throw new HttpsError("invalid-argument", `${field} has invalid or excessive image dimensions.`);
  }
  return { dataUrl: value, byteLength: bytes.length };
}

export function auditData(actorUid: string, action: string, entityType: string, entityId: string) {
  return { actorUid, action, entityType, entityId, createdAt: serverTimestamp() };
}

export function writeAuditInTransaction(tx: Transaction, actorUid: string, action: string, entityType: string, entityId: string) {
  tx.create(db.collection("auditLogs").doc(), auditData(actorUid, action, entityType, entityId));
}

export function writeAuditInBatch(batch: FirebaseFirestore.WriteBatch, actorUid: string, action: string, entityType: string, entityId: string) {
  batch.create(db.collection("auditLogs").doc(), auditData(actorUid, action, entityType, entityId));
}

export function millisFromFirestore(value: unknown): number {
  if (value instanceof Timestamp) return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") return Date.parse(value);
  return Number.NaN;
}

export function ensureDocumentRef<T = FirebaseFirestore.DocumentData>(ref: DocumentReference<T>, message: string): never {
  throw new HttpsError("not-found", message);
}
