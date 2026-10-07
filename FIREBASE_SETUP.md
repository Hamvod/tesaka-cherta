# Tesaka Cherta — static Firebase app

## Architecture

The browser app is a static Vite build. There is **no tRPC API, Express server, PostgreSQL database, Drizzle schema, or Vercel function**. Firebase Authentication handles sign-in; the Firebase web SDK reads and writes Cloud Firestore directly from the browser. Vercel can continue hosting the static build, and `firebase.json` also defines Firebase Hosting.

The Firebase web configuration is hard-coded in `client/src/lib/firebase.ts`, as requested. Firebase web API keys identify the project; authorization is enforced by Firestore rules, not by hiding this configuration.

## First-time setup

1. In Firebase project `studio-7668403722-dc933`, enable **Authentication → Email/Password** and create the Firestore database.
2. Enable Firebase Authentication domains for the production site and any preview hosts.
3. Install dependencies and build the static app:

   ```sh
   pnpm install
   pnpm check
   pnpm test
   pnpm build
   ```

4. Sign in to Firebase CLI with an authorized account, then deploy the rules and indexes:

   ```sh
   firebase login
   firebase deploy --only firestore:rules,firestore:indexes
   ```

5. Optionally host the static build from Firebase Hosting:

   ```sh
   firebase deploy --only hosting
   ```

   For Vercel, connect the repository; its `vercel.json` builds `dist/public` and uses only the SPA fallback rewrite.

6. Provision administrator access from a trusted environment. The Admin SDK script sets a server-controlled custom claim and the matching Firestore profile; it is **not** included in the browser bundle:

   ```sh
   GOOGLE_APPLICATION_CREDENTIALS=/secure/path/service-account.json \
   ADMIN_SEED_EMAIL=admin@example.com \
   ADMIN_SEED_PASSWORD='use-a-secure-password' \
   pnpm admin:seed
   ```

   Never commit service-account keys or passwords. Sign out/in or refresh the ID token after changing custom claims.

## Firestore collections

- `users/{uid}` — profile, `role`, account `status`; only the owner and a claim-verified admin may read it.
- `users/{uid}/watchlist/{auctionId}` — private saved auctions.
- `users/{uid}/payments/{paymentId}` — payment records created only by admins. A bidder can consume an independently verified paid record once.
- `users/{uid}/bids/{bidId}` — private bidder history, immutable from the client after creation.
- `auctions/{auctionId}` — listings and lifecycle (`draft`, `live`, `closed`).
- `auctions/{auctionId}/entries/{bidId}` — bid amounts; readable only by admins, not other bidders.
- `auctions/{auctionId}/bidderCounters/{uid}` — transaction-bound per-user bid cap.
- `results/{auctionId}` — public, immutable-after-publication result and verification hash.
- `reports/{reportId}` — private complaints/support reports; the reporter and admins can read them.
- `auditLogs/{eventId}` — admin audit events.

The application rules restrict administrator operations to Firebase ID tokens carrying the signed `admin: true` custom claim. A user cannot assign themselves the admin role, mark their own payment paid, modify submitted bid records, or read other bidders' entries. Auction bids use a Firestore transaction: the auction must be live and within its dates/limits, an admin-created paid record must match the configured fee and be unused, and the bidder's per-auction counter must remain within its cap.

## Important operating limits

- **No payment gateway is connected.** This static app does not charge money or verify Telebirr. Admins may record a payment only after checking it independently with the provider. Do not mark a record paid based only on a user-provided claim.
- Auction-result calculation now runs in the admin browser and is protected by Firestore's admin custom claim. This removes the server, but it is not a substitute for an independently auditable trusted settlement service for real-money contests.
- The old SQL database and migrations are no longer used by the app. Existing auctions, bids, payments, and results in PostgreSQL are **not automatically copied** to Firestore. Import and validate any records you need before relying on the new Firebase collections.
- Firestore rules and indexes in the repository must be deployed to project `studio-7668403722-dc933` before the Firebase-only workflows can read/write their new collections.
- Firebase client screens use direct queries. Firestore query/index errors appear in the UI/console and may require deploying the indexes in `firestore.indexes.json`.

## Validation

```sh
pnpm check
pnpm test
pnpm build
```
