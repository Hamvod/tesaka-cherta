# Frontend conversion outcomes

- Remove the deployable backend from the repository; the app build must not import Firebase Functions, Express, or server runtime code.
- Use the supplied `tesaka-cherta` Firebase web configuration in the browser client, including Analytics.
- Keep the existing complete frontend routes and visual marketplace experience intact.
- Provide a clear frontend-only action adapter so preview interactions do not depend on a missing backend.
- Provide an optional Socket.IO realtime client contract with a working Firebase/local fallback when no socket server is configured.
- Keep the Admin SDK seed utility outside the browser bundle and require environment-provided credentials/password.
- Build successfully with TypeScript checks and Vite output suitable for Vercel.
- Push the result to a new private GitHub repository and link that repository to a Vercel preview project.
