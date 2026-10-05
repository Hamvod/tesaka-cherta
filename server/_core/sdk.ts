import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Request } from "express";
import type { User } from "../../drizzle/schema";
import * as db from "../db";

const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "studio-7668403722-dc933";
const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;
const FIREBASE_KEYS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

function numericUserId(uid: string): number {
  let hash = 2166136261;
  for (let index = 0; index < uid.length; index += 1) {
    hash ^= uid.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 2_000_000_000 + 1;
}

function fallbackUser(uid: string, name: string, email: string | null, signInProvider: string | null, isAdmin: boolean): User {
  const now = new Date();
  return {
    id: numericUserId(uid),
    openId: uid,
    name,
    email,
    loginMethod: signInProvider,
    role: isAdmin ? "admin" : "user",
    status: "active",
    createdAt: now,
    updatedAt: now,
    lastSignedIn: now,
  };
}

export type AuthenticatedUser = User;

class FirebaseAuthServer {
  async authenticateRequest(req: Request): Promise<AuthenticatedUser> {
    const authorization = req.headers.authorization;
    const token = typeof authorization === "string" && authorization.startsWith("Bearer ")
      ? authorization.slice(7)
      : "";
    if (!token) throw new Error("Firebase ID token is required");

    const { payload } = await jwtVerify(token, FIREBASE_KEYS, {
      issuer: FIREBASE_ISSUER,
      audience: FIREBASE_PROJECT_ID,
      algorithms: ["RS256"],
    });
    const uid = typeof payload.sub === "string" ? payload.sub : "";
    if (!uid || uid.length > 128) throw new Error("Invalid Firebase user ID token");

    const email = typeof payload.email === "string" ? payload.email : null;
    const name = typeof payload.name === "string"
      ? payload.name
      : email?.split("@")[0] ?? "Tesaka member";
    const firebaseClaims = payload.firebase;
    const signInProvider = firebaseClaims && typeof firebaseClaims === "object" &&
      "sign_in_provider" in firebaseClaims && typeof firebaseClaims.sign_in_provider === "string"
      ? firebaseClaims.sign_in_provider
      : "firebase";
    const isAdmin = payload.admin === true;
    const user = fallbackUser(uid, name, email, signInProvider, isAdmin);

    // Keep the existing transactional backend's relational identity row when a
    // database is configured. Firestore user data is managed directly by the client.
    try {
      await db.upsertUser({ openId: uid, name, email, loginMethod: signInProvider, role: isAdmin ? "admin" : "user", lastSignedIn: new Date() });
      const persistedUser = await db.getUserByOpenId(uid);
      if (persistedUser) return { ...persistedUser, role: isAdmin ? "admin" : "user" };
    } catch (error) {
      console.warn("[Firebase Auth] Could not sync Firebase identity to the optional SQL backend", error);
    }
    return user;
  }
}

export const sdk = new FirebaseAuthServer();
