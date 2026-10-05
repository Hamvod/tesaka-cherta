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
| `SUPABASE_URL` | Supabase project URL (e.g. `https://xxxx.supabase.co`) |
| `SUPABASE_ANON_KEY` | Supabase public anon key (safe for the browser; also set as `VITE_SUPABASE_ANON_KEY`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service-role key; server-only secret used to verify user JWTs |
| `SUPABASE_ADMIN_EMAIL` | Email address granted the `admin` role in the app (e.g. the owner's Google account) |
| `BUILT_IN_FORGE_API_URL` | Storage/notification/other server integration base URL |
| `BUILT_IN_FORGE_API_KEY` | Server integration secret |
| `TELEBIRR_BASE_URL` | Optional; add only after approved merchant API access |
| `TELEBIRR_APP_ID` | Optional Telebirr server credential |
| `TELEBIRR_APP_KEY` | Optional Telebirr server credential; store as a Vercel secret |
| `TELEBIRR_PUBLIC_KEY` | Optional callback verification key |
| `TELEBIRR_CALLBACK_SECRET` | Optional callback verification secret |

Client build variables (Vite): `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. If your Vercel/Supabase integration instead exposes `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or the newer `*_SUPABASE_PUBLISHABLE_KEY` names), those work too — `vite.config.ts` exposes both prefixes and the code accepts either name pair. Server-side, `SUPABASE_SECRET_KEY` is accepted as an alias for `SUPABASE_SERVICE_ROLE_KEY`.

The code also recognizes `POSTGRES_URL` and `SUPABASE_DB_URL` as fallbacks if the Vercel Supabase integration creates one of those names. Prefer renaming or duplicating the pooled URL as `DATABASE_URL` for clarity.

## 4. Supabase Auth (Google sign-in)

Authentication is handled entirely by **Supabase Auth** — there is no separate OAuth server.

1. In the Supabase dashboard go to **Authentication → Providers** and enable **Google**.
2. Create a Google Cloud OAuth client as instructed by Supabase, then paste the Client ID and Client Secret into the provider settings.
3. Add the Supabase-issued callback URL (`https://<project-ref>.supabase.co/auth/v1/callback`) to the Google OAuth client's authorized redirect URIs.
4. In Supabase **Authentication → URL Configuration**, add your production domain (the Vercel domain) and `http://localhost:3000` for local development to the allowed redirect URLs.
5. The app sends users to `signInWithOAuth({ provider: "google" })`; Supabase returns them to `{origin}/account`. The browser stores the session; every API call forwards the access token as a `Bearer` header, and the server verifies it with the service-role client.

Admin role: the server grants the `admin` role to the Supabase account whose email matches `SUPABASE_ADMIN_EMAIL`. There is no hard-coded password; configure a strong password for that account in Google/Supabase as you normally would.

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
