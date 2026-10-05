export const ENV = {
  databaseUrl: process.env.DATABASE_URL ?? process.env.POSTGRES_URL ?? process.env.SUPABASE_DB_URL ?? "",
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
