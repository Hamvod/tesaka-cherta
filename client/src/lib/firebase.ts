import { getApp, getApps, initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { connectAuthEmulator, getAuth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore } from "firebase/firestore";

// This web configuration is public Firebase project configuration. Protect
// data with Firebase Auth and Firestore rules; never put Admin SDK credentials here.
export const firebaseConfig = {
  apiKey: "AIzaSyAgNS1aDBSCghkSaBZZe6sm6hcLWk8GCIM",
  authDomain: "tesaka-cherta.firebaseapp.com",
  projectId: "tesaka-cherta",
  storageBucket: "tesaka-cherta.firebasestorage.app",
  messagingSenderId: "631698318918",
  appId: "1:631698318918:web:375f05e28998575aaacc47",
  measurementId: "G-ZFJK9J36SE",
};

const useEmulators = import.meta.env.VITE_FIREBASE_USE_EMULATORS === "true";
const activeFirebaseConfig = useEmulators
  ? { ...firebaseConfig, projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "demo-tesaka-cherta" }
  : firebaseConfig;

export const firebaseApp = getApps().length ? getApp() : initializeApp(activeFirebaseConfig);
export const analytics = typeof window !== "undefined" ? getAnalytics(firebaseApp) : null;
export const auth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);
export const FIREBASE_PROJECT_ID = activeFirebaseConfig.projectId;

if (useEmulators) {
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  connectFirestoreEmulator(firestore, "127.0.0.1", 8080);
}
