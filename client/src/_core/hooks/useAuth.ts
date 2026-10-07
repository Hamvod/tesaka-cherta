import { getIdTokenResult, onIdTokenChanged, signOut, type User as FirebaseUser } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { auth, firestore } from "@/lib/firebase";
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
  const [isAdmin, setIsAdmin] = useState(false);
  const [isSuspended, setIsSuspended] = useState(false);

  useEffect(() => {
    let active = true;
    let generation = 0;
    let stopProfile: (() => void) | undefined;
    const unsubscribe = onIdTokenChanged(auth, (nextUser) => {
      const currentGeneration = ++generation;
      stopProfile?.();
      stopProfile = undefined;
      setFirebaseUser(nextUser);
      setLoading(true);
      if (!nextUser) {
        setIsAdmin(false);
        setIsSuspended(false);
        setError(null);
        setLoading(false);
        return;
      }
      void ensureUserDocument(nextUser).catch((profileError: unknown) => {
        console.error("[Firestore] Could not initialize the user profile", profileError);
      });
      stopProfile = onSnapshot(doc(firestore, "users", nextUser.uid), (profile) => {
        if (active && currentGeneration === generation) setIsSuspended(profile.data()?.status === "suspended");
      }, (profileError) => {
        console.error("[Firestore] Could not read account status", profileError);
      });
      void getIdTokenResult(nextUser).then((tokenResult) => {
        if (!active || currentGeneration !== generation) return;
        setIsAdmin(tokenResult.claims.admin === true);
        setError(null);
      }).catch((authError: unknown) => {
        if (!active || currentGeneration !== generation) return;
        setIsAdmin(false);
        setError(authError instanceof Error ? authError : new Error("Could not read Firebase access claims"));
      }).finally(() => {
        if (active && currentGeneration === generation) setLoading(false);
      });
    }, (authError) => {
      setError(authError);
      setFirebaseUser(null);
      setIsAdmin(false);
      setIsSuspended(false);
      setLoading(false);
    });
    return () => {
      active = false;
      stopProfile?.();
      unsubscribe();
    };
  }, []);

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
    isAdmin,
    isSuspended,
    isAuthenticated: Boolean(user),
    refresh: async () => auth.currentUser?.reload(),
    logout,
  };
}
