import { ENV } from "./env.js";

export function isSupabaseConfigured(): boolean {
  return Boolean(ENV.supabaseUrl && ENV.supabaseServiceRoleKey);
}

export type SupabaseAccount = {
  id: string;
  email: string | null;
  name: string | null;
};

type SupabaseUserResponse = {
  id?: unknown;
  email?: unknown;
  user_metadata?: Record<string, unknown>;
};

function readName(metadata: Record<string, unknown> | undefined, email: string | null): string | null {
  const meta = metadata ?? {};
  const candidates = [meta.full_name, meta.name, meta.preferred_username];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim().length > 0) return candidate.trim();
  }
  return null;
}

/**
 * Verify a Supabase access token against the project's Auth service by calling
 * GET /auth/v1/user. Returns null when Supabase is unconfigured or the token is
 * not a valid Supabase session, which lets the caller fall back to Firebase.
 */
export async function getSupabaseAccount(
  accessToken: string
): Promise<SupabaseAccount | null> {
  if (!isSupabaseConfigured() || !accessToken) return null;

  try {
    const response = await fetch(`${ENV.supabaseUrl.replace(/\/+$/, "")}/auth/v1/user`, {
      method: "GET",
      headers: {
        apikey: ENV.supabaseServiceRoleKey,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    // 401/403 means the token is not a valid Supabase session -> fall back.
    if (!response.ok) return null;

    const payload = (await response.json()) as SupabaseUserResponse;
    const id = typeof payload.id === "string" ? payload.id : "";
    if (!id) return null;

    const email = typeof payload.email === "string" ? payload.email.toLowerCase() : null;
    return { id, email, name: readName(payload.user_metadata, email) };
  } catch {
    return null;
  }
}
