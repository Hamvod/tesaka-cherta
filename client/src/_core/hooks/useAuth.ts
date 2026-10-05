import { getIdTokenResult, onIdTokenChanged, signOut, type User as FirebaseUser } from "firebase/auth";
import { useCallback, useEffect, useState } from "react";
import { useLocation } from "wouter";
import { auth } from "@/lib/firebase";
import { ensureUserDocument } from "@/lib/firebaseData";
import { isSupabaseEnabled, signOutOfSupabase, supabase } from "@/lib/supabase";
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
  const [supabaseUserId, setSupabaseUserId] = useState<string | null>(null);
  const [supabaseUser, setSupabaseUser] = useState<{ name: string; email: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Supabase session (primary). Resolves the server-assigned role for the
  // account so admin-only screens behave the same as with Firebase claims.
  const meQuery = trpc.auth.me.useQuery(undefined, {
    enabled: supabaseUserId !== null,
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (supabaseUserId === null) return;
    const role = (meQuery.data as { role?: string } | null | undefined)?.role;
    if (role) setIsAdmin(role === "admin");
  }, [meQuery.data, supabaseUserId]);

  useEffect(() => {
    if (!isSupabaseEnabled()) return;
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session?.user) {
        setSupabaseUserId(null);
        setSupabaseUser(null);
        setLoading(false);
        return;
      }
      const metadata = session.user.user_metadata ?? {};
      const name =
        typeof metadata.full_name === "string" && metadata.full_name.length > 0
          ? metadata.full_name
          : typeof metadata.name === "string" && metadata.name.length > 0
            ? metadata.name
            : session.user.email?.split("@")[0] ?? "Tesaka member";
      setSupabaseUserId(session.user.id);
      setSupabaseUser({ name, email: session.user.email ?? null });
    });
    return () => data.subscription.unsubscribe();
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
  const user: CurrentUser | null =
    supabaseUserId !== null && supabaseUser
      ? {
          uid: supabaseUserId,
          name: supabaseUser.name,
          email: supabaseUser.email,
          photoURL: null,
          firebaseUser: null,
        }
      : firebaseBackedUser;

  useEffect(() => {
    if (!redirectOnUnauthenticated || loading || user) return;
    const currentPath = window.location.pathname;
    if (redirectPath && currentPath !== redirectPath) setLocation(redirectPath);
  }, [redirectOnUnauthenticated, redirectPath, loading, user, setLocation]);

  const logout = useCallback(async () => {
    if (isSupabaseEnabled()) {
      await signOutOfSupabase().catch(() => {});
    }
    await signOut(auth);
  }, []);

  return {
    user,
    loading,
    error,
    isAdmin,
    isAuthenticated: Boolean(user),
    refresh: async () => {
      if (supabaseUserId !== null) {
        await meQuery.refetch();
        return;
      }
      await auth.currentUser?.reload();
    },
    logout,
  };
}
