export const ENV = {
  databaseUrl: process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.SUPABASE_DB_URL ?? "",
  supabaseUrl: process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey:
    process.env.SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    "",
  supabaseServiceRoleKey:
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    "",
  supabaseAdminEmail: process.env.SUPABASE_ADMIN_EMAIL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  telebirrBaseUrl: process.env.TELEBIRR_BASE_URL ?? "",
  telebirrAppId: process.env.TELEBIRR_APP_ID ?? "",
  telebirrAppKey: process.env.TELEBIRR_APP_KEY ?? "",
  telebirrPublicKey: process.env.TELEBIRR_PUBLIC_KEY ?? "",
  telebirrCallbackSecret: process.env.TELEBIRR_CALLBACK_SECRET ?? "",
};
