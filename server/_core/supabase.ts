import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ENV } from "./env";

let _admin: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient | null {
  if (!ENV.supabaseUrl || !ENV.supabaseServiceRoleKey) {
    return null;
  }
  if (!_admin) {
    _admin = createClient(ENV.supabaseUrl, ENV.supabaseServiceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}

export type SupabaseAccount = {
  id: string;
  email: string | null;
  name: string | null;
};

export async function getSupabaseAccount(
  accessToken: string
): Promise<SupabaseAccount | null> {
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  try {
    const { data, error } = await sb.auth.getUser(accessToken);
    if (error || !data.user) return null;
    const meta = data.user.user_metadata ?? {};
    const name =
      typeof meta.full_name === "string" && meta.full_name.trim().length > 0
        ? meta.full_name
        : typeof meta.name === "string" && meta.name.trim().length > 0
          ? meta.name
          : null;
    return {
      id: data.user.id,
      email: data.user.email ?? null,
      name,
    };
  } catch {
    return null;
  }
}

export function isSupabaseConfigured(): boolean {
  return Boolean(ENV.supabaseUrl && ENV.supabaseServiceRoleKey);
}