import { getApp, getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// Firebase web API keys identify the project and are intended to be public.
// Protect all data with Firebase Authentication and Firestore Security Rules.
const firebaseConfig = {
  apiKey: "AIzaSyARTs2gdxEmW6vFWrHTK-fRJSat0BSmf0g",
  authDomain: "studio-7668403722-dc933.firebaseapp.com",
  databaseURL: "https://studio-7668403722-dc933-default-rtdb.firebaseio.com",
  projectId: "studio-7668403722-dc933",
  storageBucket: "studio-7668403722-dc933.firebasestorage.app",
  messagingSenderId: "429587645709",
  appId: "1:429587645709:web:76ee839fe30eff77ab1c44",
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const firestore = getFirestore(firebaseApp);
export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
