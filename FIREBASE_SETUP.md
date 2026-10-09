# Tesaka Cherta — Firebase-only setup

## Architecture

The application is a static React/Vite site backed by Firebase Authentication, Cloud Firestore, and Firebase Cloud Functions v2. It does **not** use Cloud Storage, a Storage bucket, tRPC, an Express application server, or PostgreSQL. Authentication uses email/password and Firebase custom claims (`admin: true` and `owner: true`) for access control. The web configuration is kept in `client/src/lib/firebase.ts` as requested; security comes from Firestore rules and trusted callable functions, not from hiding the Firebase web API key.

## Firebase project setup

1. In project `studio-7668403722-dc933`, enable **Authentication → Email/Password** and initialize Cloud Firestore.
2. Add `tesaka-cherta.vercel.app` and any intended preview hosts under **Authentication → Settings → Authorized domains**.
3. Do not create or configure a Storage bucket for this app. No Storage rules or bucket CORS settings are needed.
4. Cloud Functions explicitly allow `https://tesaka-cherta.vercel.app` and local Vite `http://localhost:5173`; update `CALLABLE_OPTIONS` if the production host changes.
5. Install the Firebase CLI, authenticate, and select the project:

   ```sh
   npm install --global firebase-tools
   firebase login
   firebase use studio-7668403722-dc933
   ```

6. Install and validate the app and Functions:

   ```sh
   pnpm install --frozen-lockfile
   pnpm check
   pnpm test
   pnpm build
   npm --prefix functions install
   npm --prefix functions run build
   ```

Cloud Functions and scheduled lifecycle processing may require a billing-enabled Firebase/Google Cloud project. The app does not charge bidders or connect to a payment provider.

## Admin seeding

Provision initial administrator access only from a trusted environment. Keep the service-account file outside the repository and supply a new password through the environment:

```sh
GOOGLE_APPLICATION_CREDENTIALS=/secure/path/service-account.json \
ADMIN_SEED_EMAIL=admin@example.com \
ADMIN_SEED_PASSWORD='use-a-new-strong-password' \
ADMIN_DISPLAY_NAME='Tesaka Cherta Admin' \
pnpm admin:seed
```

The script verifies that the service account belongs to the configured project, then sets the server-controlled `admin: true` custom claim and matching Firestore profile. If the email already exists, the seed script resets that user's password to `ADMIN_SEED_PASSWORD`. Never commit service-account credentials or passwords. After any custom-claim change, sign out/in or force-refresh the ID token.

## Data and image design

- **Authentication and roles:** Firebase Auth provides email/password sign-in. Admin and approved seller privileges use custom claims, refreshed after role changes.
- **Firestore reads:** The browser reads permitted public auction/result data and signed-in users' permitted account records directly from Firestore.
- **Privileged writes:** Cloud Functions validate auction edits, payment review, bids, result calculation, owner approval, moderation, and reports. Browser writes to privileged collections remain denied.
- **Product images:** The browser converts JPEG/PNG/WebP selections to JPEG and compresses each to at most **300 KiB**. The trusted auction callable validates the base64 image, size, JPEG header, and dimensions before writing a separate `auctionImages/{auctionId}` document. Auction/result documents store only a small `firestore-image:{auctionId}` reference. Images load from Firestore on demand; image content is never queried.
- **Payment receipts:** A bidder may submit a provider transaction reference and/or a compressed receipt image. A receipt is written to `users/{uid}/payments/{paymentId}/proofs/receipt`; only that bidder and admins can read it. The payment record itself contains only a `hasReceiptImage` flag and other review metadata.

Firestore's maximum document size is 1 MiB. Images are stored separately and kept below 300 KiB raw to leave room for base64 and Firestore document overhead. Legacy listings that only contain a former Storage URL need a new image selected in the auction editor before they can display from Firestore. Firestore reads/writes and data transfer count toward Firestore quotas and pricing; this avoids Cloud Storage but does not make image usage free.

## Deploy rules and Functions

The app does not require custom composite indexes. Compound queries are kept simple, and results that need sorting are sorted in the client or Function. Firestore still maintains its default single-field indexes automatically; these are required by Firestore and are not a separately deployed index set.

Deploy the Firestore rules and Functions after code or schema changes:

```sh
firebase deploy --only firestore:rules,functions --project studio-7668403722-dc933
```

To use Firebase Hosting for the static frontend, build and deploy it separately:

```sh
pnpm build
firebase deploy --only hosting --project studio-7668403722-dc933
```

The current production frontend is served from Vercel. Functions use the `us-central1` region. If a callable preflight lacks `Access-Control-Allow-Origin` and the endpoint returns 404, deploy the Functions above: CORS headers cannot be returned by a function that is missing from the project. The app makes no browser requests to Firebase Storage, so Storage CORS is not part of this setup.

## Auction and account workflows

- **Marketplace:** Publicly published/live auctions and completed results are read from Firestore; the winner gallery shows result references and integrity hashes.
- **Payment proof:** The simple form submits a transaction reference and/or a compressed receipt image directly to a Firebase callable. Receipt images are stored privately in Firestore. Proofs stay pending until an administrator independently confirms the transaction with the provider and marks it paid or failed. No OCR or TIN is requested or stored.
- **Bids:** `placeBid` validates the signed-in user, auction schedule/status, amount/range, per-user cap, rate limit, and a matching unused administrator-verified payment. One Firestore transaction consumes payment, updates counts, records the private bid/entry, and creates a notification.
- **Lowest unique bid:** Finalization reads server-maintained amount-frequency records. The lowest amount submitted exactly once wins; if none is unique, the result records that. Finalization writes the public result, SHA-256 integrity hash/reference, private winner record, notification, and audit event. A scheduled function starts and finalizes auctions by their configured schedule.
- **Owner portal:** Users can apply for seller access. Admin review assigns or removes the `owner: true` custom claim. Approved owners create listings with Firestore-backed images; listings go through admin review before publication.
- **Admin portal:** Admins manage auctions, seller applications/listings, users, manual payment records and bidder-submitted proofs, reports/replies, and audit history. A published/live zero-bid auction can be closed for editing before its scheduled end. Edits save as a draft and must be reviewed/published again. Auctions with accepted bids cannot use that edit flow.
- **Account:** Users can view profile preferences, bid/win history, saved auctions, payment-proof status, notifications, registered devices, and their private reports.
- **Languages:** The client supports English and Amharic, with language preference stored in the account and local storage.

## Main Firestore collections

| Collection | Purpose and access |
| --- | --- |
| `users/{uid}` | Profile and account state; user/admin reads, narrow user profile edits only. |
| `users/{uid}/watchlist/{auctionId}` | User-owned saved listings. |
| `users/{uid}/payments/{paymentId}` | Payment proof status; the bidder reads their own record and admins review it. |
| `users/{uid}/payments/{paymentId}/proofs/receipt` | Private compressed receipt image; bidder/admin read, callable-only write. |
| `users/{uid}/bids/{bidId}` | Private immutable bid history. |
| `users/{uid}/wins/{auctionId}` | Private winner record, written by Functions. |
| `users/{uid}/notifications/{id}` | Private notifications; only read-state updates are allowed from the client. |
| `users/{uid}/devices/{deviceId}` | Registered browser/device metadata. |
| `ownerApplications/{uid}` | Seller application and admin decision. |
| `products/{productId}` | Product catalog metadata, written by Functions. |
| `auctions/{auctionId}` | Listing, schedule, bid settings, and lifecycle; client writes denied. |
| `auctionImages/{auctionId}` | Separate compressed JPEG; public only for public auctions, otherwise owner/admin reads. Callable-only writes. |
| `auctions/{auctionId}/entries/{bidId}` | Private bid entries; admin-only reads and Functions-only writes. |
| `auctions/{auctionId}/amountCounts/{amountCents}` | Server-maintained amount frequencies used for result calculation. |
| `results/{auctionId}` | Public completed result, reference, and integrity hash; Functions-only writes. |
| `reports/{reportId}` | Support/safety report; reporter and admin reads. Private admin notes are in a protected subcollection. |
| `auditLogs/{eventId}` | Admin/system activity, written by Functions. |
| `paymentReferences/{hash}` | Transaction-reference uniqueness guard; client access denied. |

## Local validation and emulators

The emulator smoke test uses the demo-only project ID `demo-tesaka-cherta`; it does not deploy to or write to the live project. It covers seller onboarding, Firestore image read access, private proof-image permissions, payment approval and one-time consumption, CORS, and lowest-unique-bid result publication.

```sh
pnpm check
pnpm test
pnpm build
npm --prefix functions run build
npx --yes firebase-tools emulators:exec \
  --project demo-tesaka-cherta \
  --only auth,firestore,functions,pubsub \
  "npm --prefix functions run test:emulator"
```

## Operating limits and security

- **No payment gateway/provider API is connected.** OCR reads visible screenshot text only; it cannot check the provider ledger or detect a forged screenshot. An administrator must independently confirm settlement. A verified payment authorizes one bid only.
- Keep Firestore rules and Functions deployed together. The app has no custom composite-index manifest. A browser UI is not an authorization boundary; backend validation and deployed rules are.
- The prior SQL data is not automatically migrated. Existing auctions, bids, payments, and results in PostgreSQL are not copied to Firestore.
- The Firebase web API key is public project configuration. Never place Admin SDK credentials, service-account JSON, payment-provider secrets, or user passwords in the browser bundle or Git.
- Product and receipt images are intentionally rejected above 300 KiB after compression. Firestore is being used instead of a dedicated object-storage service, so this small-image constraint helps keep the data model inside Firestore's document cap and reasonable usage.
