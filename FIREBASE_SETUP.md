# Firebase setup for Tesaka Cherta

The browser app now uses the supplied Firebase project for **Firebase Authentication** and **Cloud Firestore**. Firebase Auth handles email/password registration, sign-in, password resets, and sign-out. User profiles and saved-auction lists are stored in Firestore at `users/{uid}` and `users/{uid}/watchlist/{auctionId}`. The API verifies Firebase ID tokens before allowing protected tRPC procedures.

## 1. Enable Firebase services

In Firebase Console for project `studio-7668403722-dc933`:

1. Open **Authentication → Sign-in method** and enable **Email/Password**.
2. Open **Firestore Database** and create a database in the location appropriate for your users.
3. Deploy the repository's `firestore.rules` from **Firestore Database → Rules**, or run `firebase deploy --only firestore:rules` after signing in to the Firebase CLI.
4. Add your deployed site's host under **Authentication → Settings → Authorized domains**.

The web SDK configuration is intentionally hard-coded in `client/src/lib/firebase.ts`, as requested. Firebase web API keys are public project identifiers; Firestore rules and Authentication are the access controls.

## 2. Server-side Firebase token verification

The Express/tRPC server validates bearer ID tokens against Google's published Firebase signing keys. The expected project ID defaults to `studio-7668403722-dc933`; set `FIREBASE_PROJECT_ID` only if deploying against a different Firebase project.

## 3. Existing auction/payment services

This migration removes Manus OAuth and moves **user profiles and saved auctions** to Firestore. The existing auction catalog, Telebirr payment order/callback, and payment-gated bid APIs remain on the repository's relational database because those server-side transactional flows still use Drizzle/PostgreSQL. Deployments that use those flows must retain `DATABASE_URL` (or `POSTGRES_URL` / `SUPABASE_DB_URL`). Bid-history documents are readable by their owner but the supplied Firestore rules intentionally deny browser writes; a trusted payment-verifying backend would need to write them.

## 4. Local validation

Install dependencies with `pnpm install`, then run `pnpm check`, `pnpm test`, and `pnpm build`.
