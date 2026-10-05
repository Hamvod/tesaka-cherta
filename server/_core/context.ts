import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { parse as parseCookieHeader } from "cookie";
import * as db from "../db";
import { getSupabaseAccount, isSupabaseConfigured } from "./supabase";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

const BEARER_PREFIX = "Bearer ";

function extractAccessToken(req: CreateExpressContextOptions["req"]): string | null {
  const header = req.headers.authorization;
  if (typeof header === "string" && header.startsWith(BEARER_PREFIX)) {
    const token = header.slice(BEARER_PREFIX.length).trim();
    if (token) return token;
  }
  const cookies = parseCookieHeader(req.headers.cookie ?? "");
  const token = cookies["sb-access-token"];
  return typeof token === "string" && token.length > 0 ? token : null;
}

async function authenticateFromRequest(
  req: CreateExpressContextOptions["req"]
): Promise<User | null> {
  const accessToken = extractAccessToken(req);
  if (!accessToken) return null;
  if (!isSupabaseConfigured()) return null;

  const account = await getSupabaseAccount(accessToken);
  if (!account) return null;

  const user = await db.syncSupabaseUser({
    supabaseId: account.id,
    email: account.email,
    name: account.name,
    loginMethod: "google",
  });
  return user ?? null;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await authenticateFromRequest(opts.req);
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