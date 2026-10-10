import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";
import { connectFunctionsEmulator, getFunctions } from "firebase/functions";

// Firebase web API keys identify the project and are intended to be public.
// Protect all data with Firebase Auth, Firestore rules, and server-side validation.
const firebaseConfig = {
  apiKey: "AIzaSyARTs2gdxEmW6vFWrHTK-fRJSat0BSmf0g",
  authDomain: "studio-7668403722-dc933.firebaseapp.com",
  databaseURL: "https://studio-7668403722-dc933-default-rtdb.firebaseio.com",
  storageBucket: "studio-7668403722-dc933.firebasestorage.app",
  projectId: "studio-7668403722-dc933",
  messagingSenderId: "429587645709",
  appId: "1:429587645709:web:76ee839fe30eff77ab1c44",
};

const useEmulators = import.meta.env.VITE_FIREBASE_USE_EMULATORS === "true";
const activeFirebaseConfig = useEmulators ? { ...firebaseConfig, projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "demo-tesaka-cherta" } : firebaseConfig;

export const firebaseApp = getApps().length ? getApp() : initializeApp(activeFirebaseConfig);
export const auth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);
export const functions = getFunctions(firebaseApp, "us-central1");
export const FIREBASE_PROJECT_ID = activeFirebaseConfig.projectId;

if (useEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
  connectFunctionsEmulator(functions, "127.0.0.1", 5001);
}
