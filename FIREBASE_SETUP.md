# Tesaka Cherta: Firebase and auction operations

## Authentication and profile data

The web app uses Firebase project `studio-7668403722-dc933` for Firebase email/password Authentication and Cloud Firestore. The browser Firebase configuration is intentionally hard-coded in `client/src/lib/firebase.ts`, as requested. Firebase web API keys identify the public project; Firebase Auth and the Firestore rules are the security boundary.

The client stores user profile preferences and saved-auction entries in Firestore at `users/{uid}` and `users/{uid}/watchlist/{auctionId}`. Deploy `firestore.rules` and add the production and preview hosts under Firebase Authentication → Settings → Authorized domains.

The Express/tRPC API verifies Firebase ID tokens against Google's signing keys and the expected Firebase project ID. Set `FIREBASE_PROJECT_ID` only when deploying to a different Firebase project. Admin access is determined from the signed `admin: true` custom claim, not a client-editable profile field. `/signin` handles sign-in; successful administrators are directed to `/admin`, and regular users to `/account`.

## Data and migration

Transactional auction data remains in PostgreSQL/Drizzle: auction inventory, bids, payment orders, results, and audit logs. Firebase Auth/Firestore do not replace this trusted transaction store. Configure one of `DATABASE_URL`, `POSTGRES_URL`, or `SUPABASE_DB_URL` for the server.

The additive SQL migrations are checked into `drizzle-postgres/`. Apply them once to the configured database using:

```sh
pnpm install
pnpm db:migrate
```

The auction migration adds start times and bid constraints, payment-linked bid records, auction results, audit logs, and the unique payment-order-per-bid constraint. A follow-up adds the sandbox payment provider. **Migrations have not been applied from this workspace** because no database connection string is configured here.

## Implemented bidder and admin workflows

- **Bidder:** browse published live/upcoming auctions, inspect rules and limits, save an auction, prepare a payment order, submit a server-validated bid, see bid history and wins, and update their profile/language.
- **Admin:** `/admin` provides overview counts, draft auction creation, publication and close/result calculation, read-only user and payment views, and audit logs. All admin APIs require the verified Firebase admin claim.
- **Auction close/result:** valid bids are evaluated on the server using exact cents. The lowest amount submitted exactly once wins; results and SHA-256 bid-set hashes are stored with a reference and audit record. Expired auctions are finalized when auction/results/admin data is requested; an admin can also close early after an explicit in-app confirmation.
- In development, the catalog may add demo listings if the database is empty. It does not auto-seed listings in production.

## Payment safety and launch blockers

Real Telebirr checkout and provider-side transaction/signature verification are **not implemented**. A Telebirr callback is accepted only with the configured `TELEBIRR_CALLBACK_SECRET` header, and callback payloads are recorded as pending events; a callback cannot mark an order paid or activate a bid. A pending order is not a paid bid.

For non-production end-to-end testing only, set `ENABLE_TEST_PAYMENTS=true`. This enables explicit sandbox orders, which the application marks paid only through the authenticated sandbox procedure. The flag is forcibly disabled in production deployments. Sandbox settlement takes no real money.

Do not launch paid bids or prizes until the authorized provider flow, idempotent server-side verification, reconciliation/refunds, consumer protections, and applicable Ethiopian legal, tax, licensing, and payment requirements have been reviewed and completed.

## Admin account seeding

`pnpm admin:seed` uses the Firebase Admin SDK to create/update an account and assign the `admin: true` custom claim. Run it only from a trusted environment with `GOOGLE_APPLICATION_CREDENTIALS`, `ADMIN_SEED_EMAIL`, and `ADMIN_SEED_PASSWORD` supplied securely. Never commit service-account keys or plaintext passwords. After setting the claim, refresh the user's Firebase ID token or sign in again.

## Deliberately not included in this initial portal

Separate seller/owner accounts and verification, device/session management, notifications, reports/complaints, account suspension, category/settings management, full English/Amharic localization of every screen, and 2FA/rate-limiting/fraud tooling still require further work. The current admin creates auctions directly; seller names are display text, not verified accounts. Do not interpret this MVP as production-ready for paid auctions.

## Validation

```sh
pnpm check
pnpm test
pnpm build
```
