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
