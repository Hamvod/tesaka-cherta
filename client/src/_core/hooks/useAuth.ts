import { getIdTokenResult, onIdTokenChanged, signOut, type User as FirebaseUser } from "firebase/auth";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { auth } from "@/lib/firebase";
import { ensureUserDocument } from "@/lib/firebaseData";
import {
  getSupabaseUser,
  isSupabaseEnabled,
  onSupabaseSessionChange,
  signOutOfSupabase,
  type SupabaseUser,
} from "@/lib/supabase";
import { trpc } from "@/lib/trpc";

type CurrentUser = {
  uid: string;
  name: string;
  email: string | null;
  photoURL: string | null;
  firebaseUser: FirebaseUser | null;
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
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [supabaseChecked, setSupabaseChecked] = useState(!isSupabaseEnabled());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Supabase session (primary). Resolves the server-assigned role for the
  // account so admin-only screens behave the same as with Firebase claims.
  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: supabaseUser !== null,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (!supabaseUser) return;
    const role = (meQuery.data as { role?: string } | null | undefined)?.role;
    if (role) setIsAdmin(role === "admin");
  }, [meQuery.data, supabaseUser]);

  useEffect(() => {
    if (!isSupabaseEnabled()) return;
    let active = true;

    const sync = () => {
      void getSupabaseUser()
        .then((nextUser) => {
          if (!active) return;
          setSupabaseUser(nextUser);
          setSupabaseChecked(true);
        })
        .catch((supabaseError: unknown) => {
          if (!active) return;
          setSupabaseChecked(true);
          console.error("[Supabase] Could not read the session", supabaseError);
        });
    };

    sync();
    const unsubscribe = onSupabaseSessionChange(sync);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    let active = true;
    let generation = 0;
    const unsubscribe = onIdTokenChanged(auth, (nextUser) => {
      const currentGeneration = ++generation;
      setFirebaseUser(nextUser);
      setLoading(true);
      if (!nextUser) {
        setIsAdmin(false);
        setError(null);
        setLoading(false);
        return;
      }
      void ensureUserDocument(nextUser).catch((profileError: unknown) => {
        console.error("[Firestore] Could not initialize the user profile", profileError);
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
      setLoading(false);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const firebaseBackedUser = toCurrentUser(firebaseUser);
  // Supabase wins when a Supabase session exists; otherwise fall back to Firebase.
  const user: CurrentUser | null = supabaseUser
    ? {
        uid: supabaseUser.id,
        name: supabaseUser.name || supabaseUser.email?.split("@")[0] || "Tesaka member",
        email: supabaseUser.email,
        photoURL: null,
        firebaseUser: null,
      }
    : firebaseBackedUser;

  // Wait until the Supabase session has been resolved before deciding that the
  // visitor is signed out, otherwise protected pages can redirect too early.
  const resolvedLoading = loading || !supabaseChecked;

  useEffect(() => {
    if (!redirectOnUnauthenticated || resolvedLoading || user) return;
    const currentPath = window.location.pathname;
    if (redirectPath && currentPath !== redirectPath) setLocation(redirectPath);
  }, [redirectOnUnauthenticated, redirectPath, resolvedLoading, user, setLocation]);

  const logout = useCallback(async () => {
    if (isSupabaseEnabled()) {
      await signOutOfSupabase().catch(() => {});
      setSupabaseUser(null);
    }
    await signOut(auth);
  }, []);

  return {
    user,
    loading: resolvedLoading,
    error,
    isAdmin,
    isAuthenticated: Boolean(user),
    refresh: async () => {
      if (supabaseUser) {
        setSupabaseUser(await getSupabaseUser());
        await meQuery.refetch();
        return;
      }
      await auth.currentUser?.reload();
    },
    logout,
  };
}
