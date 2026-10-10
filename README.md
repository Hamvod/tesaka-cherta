# Tesaka Cherta

Tesaka Cherta is a React/Vite auction marketplace with Firebase Authentication, Cloud Firestore, and Firebase Cloud Functions. The frontend is deployed to Vercel; trusted auction, account, payment-review, moderation, and lifecycle operations run through Firebase Functions.

## Firestore-only data architecture

This project deliberately does **not** use Firebase Storage or any Storage SDK. Product images and payment proof images are compressed in the browser and stored in Firestore documents under the existing image collections. The Firebase web config includes the standard public `storageBucket` field, but no Storage API is imported or called.

This project also deliberately ships **no custom Firestore index file** and does not add composite indexes. Existing queries are designed around Firestore's built-in indexes.

## Run locally

```bash
pnpm install
npm --prefix functions install
pnpm dev
```

For the full Firebase emulator workflow, run the Firebase emulators for Auth, Firestore, Functions, and Pub/Sub with the supplied `firebase.json` ports.

## Firebase configuration

The browser configuration in `client/src/lib/firebase.ts` targets the `tesaka-cherta` Firebase project and initializes Auth, Firestore, Functions in `us-central1`, and Analytics. Add the Vercel deployment domains to Firebase Authentication's authorized domains.

## Seed the admin account

Run the trusted one-off seed utility only from a secure environment. The service-account JSON and password stay outside Git:

```bash
GOOGLE_APPLICATION_CREDENTIALS=/secure/path/tesaka-cherta-firebase-adminsdk.json \
FIREBASE_PROJECT_ID=tesaka-cherta \
ADMIN_SEED_EMAIL=Hamvod@gmail.com \
ADMIN_SEED_PASSWORD='choose-a-strong-password' \
ADMIN_DISPLAY_NAME='Tesaka Cherta Admin' \
pnpm admin:seed
```

The requested admin email is `Hamvod@gmail.com`. The seed utility sets the Firebase Auth password and `admin: true` custom claim, then creates the matching Firestore profile.

## Build and validate

```bash
pnpm check
pnpm test
pnpm build
npm --prefix functions run build
```

## Deployment

Vercel builds the frontend from `dist/public` using `vercel.json`. Firebase Functions and Firestore rules are deployed separately from the trusted project environment:

```bash
npx firebase-tools deploy --only functions,firestore:rules --project tesaka-cherta
```
