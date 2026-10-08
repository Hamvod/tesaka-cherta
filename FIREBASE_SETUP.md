# Tesaka Cherta — Firebase auction platform

## Architecture

The web client is a static React/Vite app. Firebase Authentication provides email/password sign-in; the Firebase Web SDK reads allowed data from Cloud Firestore and uploads product images to Cloud Storage. Trusted writes—especially bid acceptance, result calculation, owner approvals, account moderation, payment records, and report review—run through Firebase Cloud Functions v2. The project defines no tRPC endpoints, Express application server, Drizzle schema, or PostgreSQL runtime. Firebase's Functions SDK may include Express as an internal transitive package; it is not used as an application server or direct project dependency.

The Firebase web configuration is hard-coded in `client/src/lib/firebase.ts` as requested. Web API keys identify the project; security is enforced by Firebase Auth, custom claims, Firestore rules, Storage rules, and server-side validation. Cloud Functions use the Firebase Admin SDK and the configured Storage bucket.

## Firebase project setup

1. In Firebase project `studio-7668403722-dc933`, enable **Authentication → Email/Password** and create the Firestore database.
2. Confirm the project’s default Cloud Storage bucket is `studio-7668403722-dc933.firebasestorage.app` and enable Storage.
3. Add `tesaka-cherta.vercel.app` and any intended preview hosts under **Authentication → Settings → Authorized domains**.
4. Cloud Functions explicitly allow `https://tesaka-cherta.vercel.app` and local Vite `http://localhost:5173`; update `CALLABLE_OPTIONS` if the production host changes.
5. Install and build the app and Functions:

   ```sh
   pnpm install
   pnpm check
   pnpm test
   pnpm build
   npm --prefix functions install
   npm --prefix functions run build
   ```

6. With Firebase CLI authenticated to the intended project, deploy the database rules/indexes, Storage rules, and Functions:

   ```sh
   firebase login
   firebase use studio-7668403722-dc933
   firebase deploy --only firestore:rules,firestore:indexes,storage,functions
   ```

   Cloud Functions and scheduled lifecycle processing may require a billing-enabled Firebase/Google Cloud project. The app does not charge bidders or connect to a payment provider. Callable Functions explicitly allow the production origin `https://tesaka-cherta.vercel.app` and local Vite origin `http://localhost:5173`.

7. Host the static client either from the configured Firebase Hosting target or through the repository’s Vercel configuration:

   ```sh
   firebase deploy --only hosting
   ```

   Build output is `dist/public`; all application routes use the SPA fallback rewrite.

8. Provision initial administrator access from a trusted environment only:

   ```sh
   GOOGLE_APPLICATION_CREDENTIALS=/secure/path/service-account.json \
   ADMIN_SEED_EMAIL=admin@example.com \
   ADMIN_SEED_PASSWORD='use-a-secure-password' \
   pnpm admin:seed
   ```

   Never commit service-account keys or passwords. If the email already exists, the seed script resets that user’s password to `ADMIN_SEED_PASSWORD`. The script assigns the server-controlled `admin: true` custom claim and matching Firestore profile. Sign out/in or force-refresh the ID token after any custom-claim change.

## Auction and account workflows

- **Public marketplace:** Published/live auctions and published results are read from Firestore. The winner gallery exposes result references and integrity hashes.
- **Payment proof:** Before bidding on a fee-based auction, a bidder may submit a provider transaction number and/or a receipt screenshot. Tesseract.js OCR runs in the browser in English or English+Amharic according to the interface language, can suggest a transaction number and display success/failure-like words, and sends extracted text as an untrusted hint. The screenshot is uploaded to the private `payment-receipts/{uid}/` Storage folder, readable only by its owner and admins. Proof always starts as `pending`; OCR never approves or verifies payment. An admin must check the provider independently and use the review action to mark it paid or failed. No TIN is collected.
- **Bids:** `placeBid` validates the signed-in user, auction schedule/status, bid range and precision, per-user cap, rate limit, and a matching unused administrator-verified payment. One Firestore transaction consumes the payment, increments amount and bidder counters, records the private bid/entry, and creates a notification. Bids and counters cannot be written by the browser.
- **Lowest unique bid:** Finalization reads the server-maintained amount-frequency records. The lowest amount appearing exactly once wins; if no amount is unique, the result says so. Finalization writes an immutable public result, SHA-256 integrity hash/reference, bidder win record, notification, and audit event. A scheduled Function transitions published auctions at opening time and finalizes ended live auctions.
- **Owner portal:** Users can apply for seller access. Admin review assigns or removes the custom `owner: true` claim. Verified owners upload product photos to their own Storage folder and submit listings for admin review before publication.
- **Admin portal:** Custom-claim-gated views manage auctions, seller applications/listings, users, manual payment records and bidder-submitted proof review, reports/replies, and audit logs. A published/live auction can be closed for editing only while it has no accepted bids and has not reached its scheduled end. The admin edit callable saves changes as a draft; publishing returns the admin to the public marketplace. Auctions with accepted bids cannot be edited through this workflow.
- **Account:** Profile preferences, bid/win history, saved auctions, payment-proof status, notifications, device list, and private report history are available to the signed-in user.
- **Languages:** The client supports English and Amharic, with the language preference stored on the account and in local storage.

## Main Firestore collections

| Collection | Purpose and access |
| --- | --- |
| `users/{uid}` | Profile and account state; user and admin reads, narrow user profile edits only. |
| `users/{uid}/watchlist/{auctionId}` | User-owned saved listings. |
| `users/{uid}/payments/{paymentId}` | Bidder-submitted claims begin pending; admins review them. The bidder reads own record and Functions consume a matching paid record once. |
| `users/{uid}/bids/{bidId}` | Private immutable bid history. |
| `users/{uid}/wins/{auctionId}` | Private winner record, written by Functions. |
| `users/{uid}/notifications/{id}` | Private notifications; only read-state updates are allowed from the client. |
| `users/{uid}/devices/{deviceId}` | User’s registered browser/device metadata. |
| `ownerApplications/{uid}` | Seller application and admin decision. |
| `products/{productId}` | Product catalog metadata, written by Functions. |
| `auctions/{auctionId}` | Listing, schedule, bid settings, and lifecycle. Client writes are denied. |
| `auctions/{auctionId}/entries/{bidId}` | Private bid entries; admin-only reads and Functions-only writes. |
| `auctions/{auctionId}/amountCounts/{amountCents}` | Server-maintained amount frequencies used for result calculation. |
| `results/{auctionId}` | Public completed result, reference, and integrity hash; Functions-only writes. |
| `reports/{reportId}` | Private support/safety report; reporter and admin reads. Private admin notes live in a protected subcollection. |
| `auditLogs/{eventId}` | Admin/system activity, written by Functions. |
| `paymentReferences/{hash}` | Private uniqueness guard for transaction references; client access is denied. |

Receipt screenshots are stored under `payment-receipts/{uid}/{file}`; Storage rules allow only the owner/admin to read and the owner to upload an image no larger than 5 MB.

## Important operating limits

- **No payment gateway/provider API is connected.** OCR parses visible screenshot text only; it cannot verify that funds settled or detect a forged screenshot. A bidder proof remains pending until an administrator independently checks the transaction with the payment provider. No TIN is requested. A verified payment authorizes one bid only.
- Keep Firebase Security Rules, indexes, Storage rules, and Functions deployed together. If a callable URL returns 404 and the browser reports a missing CORS header, deploy the Functions: a 404 means no deployed Function exists at that URL; callable preflights are handled by the CORS allowlist in this source. After code/rule changes, run `firebase deploy --only functions,storage,firestore:rules --project studio-7668403722-dc933`. A browser UI is not an authorization boundary; the rules and callable Functions are.
- The prior SQL data is not automatically migrated. Existing auctions, bids, payments, and results in PostgreSQL are not copied to Firestore by this project. Import and validate any records before relying on the Firebase collections.
- The supplied web API key is public configuration, not a secret. Do not put Admin SDK credentials or service-account JSON into the browser bundle or Git.

## Local emulator smoke test

This test uses a **demo-only** project ID and local emulator data; it does not deploy or call the live Firebase project. It verifies owner onboarding, listing publication, closing/editing/republishing a zero-bid auction, protection against editing an auction with accepted bids, owner/admin-only receipt access, pending OCR proof status, non-admin review denial, admin proof approval, payment consumption, three accepted bids (including a duplicate amount), rejection of an unpaid bid, admin finalization, winner selection, result hash, and notifications:

```sh
npm --prefix functions run build
npx firebase-tools emulators:exec \
  --project demo-tesaka-cherta \
  --only auth,firestore,functions,storage,pubsub \
  "npm --prefix functions run test:emulator"
```

## Validation

```sh
pnpm check
pnpm test
pnpm build
npm --prefix functions run build
```
