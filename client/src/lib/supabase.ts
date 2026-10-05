import { createClient, type SupabaseClient, type Session, type User } from "@supabase/supabase-js";

// Supabase is the primary identity provider. Firebase remains the fallback.
// Vercel/Supabase expose browser-safe values as either VITE_* or NEXT_PUBLIC_*,
// and Supabase now publishes both "anon" and "publishable" keys — accept all.
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ?? import.meta.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "";

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

export function isSupabaseEnabled(): boolean {
  return supabaseUrl.length > 0 && supabaseAnonKey.length > 0;
}

let cachedSession: Session | null = null;

supabase.auth.onAuthStateChange((_event, session) => {
  cachedSession = session;
});

export async function getSupabaseAccessToken(): Promise<string | null> {
  if (cachedSession?.access_token) return cachedSession.access_token;
  const { data } = await supabase.auth.getSession();
  cachedSession = data.session;
  return data.session?.access_token ?? null;
}

export function getSupabaseUser(): User | null {
  return cachedSession?.user ?? null;
}

export async function signInWithGoogle(): Promise<void> {
  await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${window.location.origin}/account` },
  });
}

export async function signOutOfSupabase(): Promise<void> {
  await supabase.auth.signOut();
}