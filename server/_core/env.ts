export const ENV = {
  databaseUrl: process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.SUPABASE_DB_URL ?? "",
  // Supabase Auth is the primary identity provider. Vercel/Supabase expose
  // either VITE_*/NEXT_PUBLIC_* or the newer publishable/secret key names.
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
  // Admin is matched by email on the Supabase (primary) path.
  supabaseAdminEmail: (process.env.SUPABASE_ADMIN_EMAIL?.trim() || "mminani093@gmail.com").toLowerCase(),
  // Display name used for the seeded administrator account.
  adminDisplayName: process.env.ADMIN_DISPLAY_NAME?.trim() || "Homvod",
  // Firebase Auth + Firestore remain as the fallback identity/data path.
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? "studio-7668403722-dc933",
  ownerOpenId: process.env.OWNER_OPEN_ID ?? "",
  isProduction: process.env.NODE_ENV === "production",
  forgeApiUrl: process.env.BUILT_IN_FORGE_API_URL ?? "",
  forgeApiKey: process.env.BUILT_IN_FORGE_API_KEY ?? "",
  telebirrBaseUrl: process.env.TELEBIRR_BASE_URL ?? "",
  telebirrAppId: process.env.TELEBIRR_APP_ID ?? "",
  telebirrAppKey: process.env.TELEBIRR_APP_KEY ?? "",
  telebirrPublicKey: process.env.TELEBIRR_PUBLIC_KEY ?? "",
  telebirrCallbackSecret: process.env.TELEBIRR_CALLBACK_SECRET ?? "",
  enableTestPayments: process.env.ENABLE_TEST_PAYMENTS === "true" && !(process.env.VERCEL_ENV === "production" || (!process.env.VERCEL_ENV && process.env.NODE_ENV === "production")),
};
