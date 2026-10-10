# Tesaka Cherta frontend-only conversion

## Implementation approach

- Preserve the existing React/Vite marketplace UI and routes.
- Remove the deployable Cloud Functions backend and Firebase Functions client SDK usage.
- Replace the project Firebase web configuration with the supplied `tesaka-cherta` configuration.
- Keep Firebase Authentication, Firestore reads, Firestore realtime listeners, and Analytics in the browser.
- Isolate server-shaped actions behind `client/src/lib/cloudFunctions.ts`; in this frontend-only preview they write a small local action record and return predictable results instead of calling a backend.
- Add an optional Socket.IO client bridge. When `VITE_SOCKET_URL` is configured it listens for `auction:updated` and `results:updated`; without it, the UI remains functional using Firebase/Firestore and local query invalidation.
- Keep the Admin SDK seed script as a trusted one-off tool, with credentials and password supplied only through environment variables.
- Deploy the static Vite output from a new private GitHub repository to Vercel.

## Design decisions

- **Design movement:** warm editorial marketplace with Ethiopian craft-inspired accents and modern product clarity.
- **Core principles:** trust before urgency; generous whitespace; clear auction mechanics; responsive, low-friction actions.
- **Color philosophy:** deep green signals stability and local trust, parchment backgrounds soften the commerce surface, amber marks attention and time-sensitive moments, and plum provides a restrained premium accent.
- **Layout paradigm:** editorial single-column storytelling with asymmetric auction cards and compact data rails rather than a dense dashboard grid.
- **Signature elements:** the Tesaka dot-and-line mark, rounded auction media cards, and status pills with live countdown language.
- **Interaction philosophy:** actions explain their consequence before asking for commitment; saved and realtime states are visibly acknowledged.
- **Animation:** short ease-out transitions for cards and controls, restrained shimmer only for loading, no distracting continuous motion.
- **Typography:** existing system sans stack for readable product data with the current wordmark treatment for brand distinction.
- **Brand essence:** a transparent local marketplace for people who want a smarter, fairer way to discover products. Personality: clear, grounded, optimistic.
- **Brand voice:** direct, reassuring, and practical. Example lines: “Make your move with the full rule in view.” and “Real products. Clear winners.”
- **Wordmark & logo:** retain the dot-and-line Tesaka mark paired with the two-tone Tesaka Cherta lockup.
- **Signature brand color:** Tesaka deep green `#0b5f4a`.

## Project structure

- `client/src/pages/`: existing marketplace, auth, account, owner, admin, and winners screens.
- `client/src/lib/firebase.ts`: browser Firebase initialization and Analytics.
- `client/src/lib/firebaseData.ts`: Firestore reads and browser-safe data helpers.
- `client/src/lib/cloudFunctions.ts`: frontend-only local action adapter; no server imports.
- `client/src/lib/realtime.ts`: optional Socket.IO client bridge plus event contract.
- `scripts/seed-admin.ts`: trusted local Admin SDK bootstrap utility, excluded from browser build.
- `vercel.json`: static Vite build and SPA fallback.
