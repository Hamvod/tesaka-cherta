# Tesaka Cherta: Supabase and Vercel setup

The application now uses **Drizzle ORM with PostgreSQL** and is prepared for Vercel’s serverless runtime. The browser frontend remains a Vite build; OAuth, tRPC, and payment callback routes run through `api/index.ts`.

## 1. Connect Supabase from Vercel

1. Import the `mminani093-lang/tesaka-cherta` GitHub repository into Vercel.
2. Keep the detected framework as **Vite**. The repository already contains `vercel.json` with the build command and API rewrite.
3. Click **Connect Supabase** in the Vercel project’s integrations or storage area.
4. Select an existing Supabase project or create one.
5. Confirm that the integration exposes a pooled PostgreSQL connection string. The application accepts `DATABASE_URL`, `POSTGRES_URL`, or `SUPABASE_DB_URL`; `DATABASE_URL` is the preferred canonical name.
6. Add the existing Manus OAuth, session, storage, and Telebirr environment variables in Vercel. Never commit them to GitHub.

## 2. Create the Supabase schema

From a local checkout with the Supabase pooled connection string available as `DATABASE_URL`, run:

```bash
pnpm install
pnpm db:migrate
```

The generated PostgreSQL migration is also included at `drizzle-postgres/0000_little_sentry.sql`. It creates the users, profiles, auctions, bids, watchlist, payment orders, payment events, and enum types used by the application.

You can also paste that SQL into the Supabase SQL Editor if you prefer a dashboard-only setup. Run it once against the target project.

## 3. Required Vercel environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Supabase pooled PostgreSQL URL; use the pooler connection string for serverless deployments |
| `JWT_SECRET` | Session cookie signing secret |
| `VITE_APP_ID` | Manus OAuth application ID |
| `OAUTH_SERVER_URL` | Manus OAuth server URL |
| `VITE_OAUTH_PORTAL_URL` | Manus sign-in portal URL |
| `OWNER_OPEN_ID` | Owner identity for admin role assignment |
| `BUILT_IN_FORGE_API_URL` | Storage/notification/other server integration base URL |
| `BUILT_IN_FORGE_API_KEY` | Server integration secret |
| `TELEBIRR_BASE_URL` | Optional; add only after approved merchant API access |
| `TELEBIRR_APP_ID` | Optional Telebirr server credential |
| `TELEBIRR_APP_KEY` | Optional Telebirr server credential; store as a Vercel secret |
| `TELEBIRR_PUBLIC_KEY` | Optional callback verification key |
| `TELEBIRR_CALLBACK_SECRET` | Optional callback verification secret |

The code also recognizes `POSTGRES_URL` and `SUPABASE_DB_URL` as fallbacks if the Vercel Supabase integration creates one of those names. Prefer renaming or duplicating the pooled URL as `DATABASE_URL` for clarity.

## 4. OAuth callback URL

After Vercel assigns a production domain, add this callback URL to the Manus OAuth application:

```text
https://YOUR_VERCEL_DOMAIN/api/oauth/callback
```

For a preview deployment, add the preview callback URL only if the OAuth provider permits it and the preview environment has the required secrets.

## 5. Telebirr callback URL

When Telebirr merchant credentials are approved, configure its server callback to:

```text
https://YOUR_VERCEL_DOMAIN/api/payments/telebirr/callback
```

The current callback records incoming events as `pending_verification`. Do not mark a payment paid until the official Telebirr signature and transaction-status verification are implemented with the credentials and documentation issued for the merchant account.

## 6. Local verification

```bash
pnpm check
pnpm build
pnpm test
```

The build produces the static frontend in `dist/public`; Vercel serves that directory and routes `/api/*` to the serverless function.
