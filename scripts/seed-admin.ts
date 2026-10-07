import { readFile } from "node:fs/promises";
import { cert, deleteApp, initializeApp, type ServiceAccount } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";

async function main() {
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const email = process.env.ADMIN_SEED_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_SEED_PASSWORD;
  if (!credentialsPath || !email || !password) {
    throw new Error("Set GOOGLE_APPLICATION_CREDENTIALS, ADMIN_SEED_EMAIL, and ADMIN_SEED_PASSWORD before running this script.");
  }

  const serviceAccount = JSON.parse(await readFile(credentialsPath, "utf8")) as ServiceAccount & { project_id?: string };
  const expectedProjectId = process.env.FIREBASE_PROJECT_ID ?? "studio-7668403722-dc933";
  if (serviceAccount.project_id !== expectedProjectId) {
    throw new Error(`Service account project mismatch; expected ${expectedProjectId}.`);
  }

  const app = initializeApp({
    credential: cert(serviceAccount),
    projectId: expectedProjectId,
  });
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  let user;
  try {
    user = await auth.getUserByEmail(email);
    user = await auth.updateUser(user.uid, { password });
  } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
    user = await auth.createUser({ email, password, displayName: "Tesaka Administrator" });
  }

  await auth.setCustomUserClaims(user.uid, { ...user.customClaims, admin: true });
  const profile = firestore.collection("users").doc(user.uid);
  const existingProfile = await profile.get();
  await profile.set({
    uid: user.uid,
    name: user.displayName || "Tesaka Administrator",
    email: user.email ?? email,
    role: "admin",
    status: "active",
    ...(existingProfile.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    updatedAt: FieldValue.serverTimestamp(),
    lastSignedIn: FieldValue.serverTimestamp(),
  }, { merge: true });
  console.log(JSON.stringify({ uid: user.uid, email: user.email, adminClaimAssigned: true }));
  await deleteApp(app);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Admin seed failed.");
  process.exitCode = 1;
});
