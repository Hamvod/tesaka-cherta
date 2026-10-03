import { onAuthStateChanged, signOut, type User as FirebaseUser } from "firebase/auth";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { auth } from "@/lib/firebase";
import { ensureUserDocument } from "@/lib/firebaseData";

type CurrentUser = {
  uid: string;
  name: string;
  email: string | null;
  photoURL: string | null;
  firebaseUser: FirebaseUser;
};

type UseAuthOptions = {
  redirectOnUnauthenticated?: boolean;
  redirectPath?: string;
};

function toCurrentUser(user: FirebaseUser | null): CurrentUser | null {
  if (!user) return null;
  return {
    uid: user.uid,
    name: user.displayName || user.email?.split("@")[0] || "Tesaka member",
    email: user.email,
    photoURL: user.photoURL,
    firebaseUser: user,
  };
}

export function useAuth(options?: UseAuthOptions) {
  const { redirectOnUnauthenticated = false, redirectPath } = options ?? {};
  const [, setLocation] = useLocation();
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(auth.currentUser);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => onAuthStateChanged(auth, (nextUser) => {
    setFirebaseUser(nextUser);
    setLoading(false);
    setError(null);
    if (nextUser) {
      void ensureUserDocument(nextUser).catch((profileError: unknown) => {
        console.error("[Firestore] Could not initialize the user profile", profileError);
      });
    }
  }, (authError) => {
    setError(authError);
    setFirebaseUser(null);
    setLoading(false);
  }), []);

  const user = toCurrentUser(firebaseUser);
  useEffect(() => {
    if (!redirectOnUnauthenticated || loading || user) return;
    const currentPath = window.location.pathname;
    if (redirectPath && currentPath !== redirectPath) setLocation(redirectPath);
  }, [redirectOnUnauthenticated, redirectPath, loading, user, setLocation]);

  const logout = useCallback(async () => {
    await signOut(auth);
  }, []);

  return {
    user,
    loading,
    error,
    isAuthenticated: Boolean(user),
    refresh: async () => auth.currentUser?.reload(),
    logout,
  };
}
