// Supabase is the primary identity provider. Firebase remains the fallback.
// Implemented against the Supabase Auth REST API directly so the app does not
// depend on @supabase/supabase-js.
//
// Vercel/Supabase expose browser-safe values as either VITE_* or NEXT_PUBLIC_*,
// and Supabase publishes both "anon" and "publishable" keys - accept all of them.
const supabaseUrl = (
  import.meta.env.VITE_SUPABASE_URL ??
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ??
  ""
).replace(/\/+$/, "");

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "";

type StoredSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

const STORAGE_KEY = "tesaka.supabase.session";
const REFRESH_MARGIN_MS = 60_000;

export type SupabaseUser = {
  id: string;
  email: string | null;
  name: string | null;
};

type AuthUserResponse = {
  id?: unknown;
  email?: unknown;
  user_metadata?: Record<string, unknown>;
};

export function isSupabaseEnabled(): boolean {
  return supabaseUrl.length > 0 && supabaseAnonKey.length > 0;
}

const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

function readStoredSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (typeof parsed.accessToken !== "string" || parsed.accessToken.length === 0) return null;
    return {
      accessToken: parsed.accessToken,
      refreshToken: typeof parsed.refreshToken === "string" ? parsed.refreshToken : "",
      expiresAt: typeof parsed.expiresAt === "number" ? parsed.expiresAt : 0,
    };
  } catch {
    return null;
  }
}

function writeStoredSession(session: StoredSession | null): void {
  try {
    if (session) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage can be unavailable in private modes; auth still works per-request.
  }
}

/** Supabase returns the implicit-flow session in the URL fragment after OAuth. */
function consumeOAuthFragment(): StoredSession | null {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token");
  if (!accessToken) return null;
  const expiresIn = Number(params.get("expires_in") ?? "3600");
  const session: StoredSession = {
    accessToken,
    refreshToken: params.get("refresh_token") ?? "",
    expiresAt: Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000,
  };
  writeStoredSession(session);
  // Clean the fragment so the token is not left in the address bar/history.
  window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}`);
  return session;
}

async function refreshSession(session: StoredSession): Promise<StoredSession | null> {
  if (!session.refreshToken) return null;
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!payload.access_token) return null;
    const expiresIn = Number(payload.expires_in ?? "3600");
    const next: StoredSession = {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token ?? session.refreshToken,
      expiresAt: Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000,
    };
    writeStoredSession(next);
    return next;
  } catch {
    return null;
  }
}

let cachedSession: StoredSession | null | undefined;

async function resolveSession(): Promise<StoredSession | null> {
  if (cachedSession !== undefined) return cachedSession;
  if (!isSupabaseEnabled()) {
    cachedSession = null;
    return null;
  }

  const fromFragment = consumeOAuthFragment();
  let session = fromFragment ?? readStoredSession();
  if (!session) {
    cachedSession = null;
    return null;
  }
  if (session.expiresAt - REFRESH_MARGIN_MS <= Date.now()) {
    session = (await refreshSession(session)) ?? null;
    if (!session) writeStoredSession(null);
  }
  cachedSession = session;
  return session;
}

export async function getSupabaseAccessToken(): Promise<string | null> {
  const session = await resolveSession();
  return session?.accessToken ?? null;
}

/** Authoritative profile for the signed-in Supabase user. */
export async function getSupabaseUser(): Promise<SupabaseUser | null> {
  const session = await resolveSession();
  if (!session) return null;
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${session.accessToken}`,
      },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as AuthUserResponse;
    if (typeof payload.id !== "string") return null;
    const meta = payload.user_metadata ?? {};
    const rawName = [meta.full_name, meta.name, meta.preferred_username].find(
      (value): value is string => typeof value === "string" && value.trim().length > 0
    );
    return {
      id: payload.id,
      email: typeof payload.email === "string" ? payload.email : null,
      name: rawName ? rawName.trim() : null,
    };
  } catch {
    return null;
  }
}

export async function signInWithGoogle(): Promise<void> {
  if (!isSupabaseEnabled()) throw new Error("Supabase is not configured.");
  cachedSession = undefined;
  const redirectTo = `${window.location.origin}/account`;
  const params = new URLSearchParams({
    provider: "google",
    redirect_to: redirectTo,
  });
  window.location.assign(`${supabaseUrl}/auth/v1/authorize?${params.toString()}`);
}

export async function signOutOfSupabase(): Promise<void> {
  const session = await resolveSession();
  if (session) {
    try {
      await fetch(`${supabaseUrl}/auth/v1/logout`, {
        method: "POST",
        headers: {
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${session.accessToken}`,
        },
      });
    } catch {
      // Revoking server-side is best-effort; the local session is cleared regardless.
    }
  }
  writeStoredSession(null);
  cachedSession = null;
  notify();
}

/** Subscribe to sign-in/sign-out changes (including OAuth redirects). */
export function onSupabaseSessionChange(listener: () => void): () => void {
  listeners.add(listener);
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) {
      cachedSession = undefined;
      listener();
    }
  };
  window.addEventListener("storage", handleStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}
