# Tesaka Cherta

Tesaka Cherta is a static React/Vite frontend for a transparent lowest-unique-bid marketplace. The UI, authentication screens, marketplace routes, account area, owner portal, admin area, and winners gallery live under `client/src`.

## Run locally

```bash
pnpm install
pnpm dev
```

## Firebase: Firestore only

The browser uses the `tesaka-cherta` Firebase web configuration in `client/src/lib/firebase.ts` for Authentication, **Cloud Firestore**, and Analytics. This project deliberately does **not** use Firebase Storage or any Storage SDK. Product and receipt image data is kept in Firestore by the existing browser-side compression helpers.

This project also deliberately ships **no custom Firestore index file** and does not add composite indexes. Queries use Firestore's built-in single-field indexes; any future query requiring an index should be redesigned rather than adding an index deployment file.

The Firebase web API key is intentionally public configuration. Admin SDK credentials must never be committed.

## Realtime

`client/src/lib/realtime.ts` provides an optional Socket.IO client. Set `VITE_SOCKET_URL` to connect to a compatible realtime service and emit `auction:updated` or `results:updated`. With no socket URL, the app remains functional as a static frontend and uses Firebase/Firestore data plus local preview events.

## Frontend-only actions

The former deployable Cloud Functions backend has been removed. Existing UI action contracts are isolated in `client/src/lib/cloudFunctions.ts`, where preview actions are recorded in local storage. Connect those contracts to a trusted backend before enabling production writes for bids, payments, moderation, or admin decisions.

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

The requested seed email is `Hamvod@gmail.com`. For safety, the password is supplied at runtime and is not stored in this repository.

## Build

```bash
pnpm check
pnpm test
pnpm build
```

Vercel uses `vercel.json` to build the static output from `dist/public` and route SPA paths back to `index.html`.
