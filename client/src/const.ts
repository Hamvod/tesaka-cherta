import { supabase } from "@/lib/supabase";

// Start the Supabase Google OAuth login. Call this from an event handler or
// effect at the moment you want to navigate, e.g. `onClick={() => startLogin()}`.
// Supabase owns the auth session; the tRPC client forwards the access token to
// the server as a Bearer header.
export const startLogin = () => {
  const redirectTo = `${window.location.origin}/account`;
  void supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo },
  });
};

export const startLogout = async () => {
  await supabase.auth.signOut();
};