import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema.js";
import * as db from "../db.js";
import { ENV } from "./env.js";
import { sdk } from "./sdk.js";
import { getSupabaseAccount, isSupabaseConfigured } from "./supabase.js";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

const BEARER_PREFIX = "Bearer ";

function readBearerToken(req: CreateExpressContextOptions["req"]): string {
  const authorization = req.headers.authorization;
  if (typeof authorization === "string" && authorization.startsWith(BEARER_PREFIX)) {
    return authorization.slice(BEARER_PREFIX.length).trim();
  }
  return "";
}

/**
 * Identity resolution order:
 *   1. Supabase Auth (primary) — verified against the project's auth service.
 *   2. Firebase Auth (fallback) — verified against Google's secure-token JWKS.
 *
 * Both paths upsert into the same relational `users` table so bids, watches and
 * payments keep working regardless of which provider issued the session.
 */
async function authenticateRequest(
  req: CreateExpressContextOptions["req"]
): Promise<User | null> {
  const token = readBearerToken(req);
  if (!token) return null;

if (isSupabaseConfigured()) {
    const account = await getSupabaseAccount(token);
    if (account) {
      const adminEmail = ENV.supabaseAdminEmail.trim().toLowerCase();
      const role =
        account.email && adminEmail && account.email.toLowerCase() === adminEmail
          ? "admin"
          : "user";
      await db.upsertUser({
        openId: account.id,
        name: account.name,
        email: account.email,
        loginMethod: "supabase",
        role,
        lastSignedIn: new Date(),
      });
      const persisted = await db.getUserByOpenId(account.id);
      return persisted ? { ...persisted, role } : null;
    }
  }
  }

  // Fallback: Firebase ID token.
  return await sdk.authenticateRequest(req);
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}