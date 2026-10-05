import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Vercel/Supabase integrations commonly expose either VITE_* or NEXT_PUBLIC_*
// names, and Supabase now publishes both "anon" and "publishable" keys. Accept
// every combination so the browser works with whichever pair is configured.
const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ??
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ??
  "";

const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "";

export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);

let cachedAccessToken: string | null = null;

supabase.auth.onAuthStateChange((_event, session) => {
  cachedAccessToken = session?.access_token ?? null;
});

export async function getAccessToken(): Promise<string | null> {
  if (cachedAccessToken) return cachedAccessToken;
  const { data } = await supabase.auth.getSession();
  cachedAccessToken = data.session?.access_token ?? null;
  return cachedAccessToken;
}