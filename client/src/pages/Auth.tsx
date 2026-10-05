import { FormEvent, useEffect, useState } from "react";
import { createUserWithEmailAndPassword, getIdTokenResult, sendPasswordResetEmail, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { ArrowLeft, ArrowUpRight, CheckCircle2, Globe2, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { auth } from "@/lib/firebase";
import { ensureUserDocument } from "@/lib/firebaseData";
import { isSupabaseEnabled, signInWithGoogle } from "@/lib/supabase";

function authMessage(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code.includes("email-already-in-use")) return "An account already exists for this email. Sign in instead.";
  if (code.includes("invalid-credential") || code.includes("user-not-found") || code.includes("wrong-password")) return "Email or password is incorrect.";
  if (code.includes("weak-password")) return "Choose a stronger password (at least 6 characters).";
  if (code.includes("invalid-email")) return "Enter a valid email address.";
  if (code.includes("too-many-requests")) return "Too many attempts. Please try again later.";
  return error instanceof Error ? error.message : "Authentication failed. Please try again.";
}

export default function Auth({ mode = "signin" }: { mode?: "signin" | "register" }) {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isAdmin, loading } = useAuth();
  const isRegister = mode === "register";
  const supabaseReady = isSupabaseEnabled();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleSubmitting, setGoogleSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && isAuthenticated) setLocation(isAdmin ? "/admin" : "/account");
  }, [loading, isAuthenticated, isAdmin, setLocation]);

  const handleGoogleSignIn = async () => {
    setGoogleSubmitting(true);
    try {
      await signInWithGoogle();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Google sign-in failed. Try email sign-in below.");
    } finally {
      setGoogleSubmitting(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitting(true);
    try {
      if (isRegister) {
        const credential = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await updateProfile(credential.user, { displayName: name.trim() });
        await ensureUserDocument(credential.user);
        toast.success("Your account is ready");
        setLocation("/account");
      } else {
        const credential = await signInWithEmailAndPassword(auth, email.trim(), password);
        const tokenResult = await getIdTokenResult(credential.user);
        toast.success("Welcome back");
        setLocation(tokenResult.claims.admin === true ? "/admin" : "/account");
      }
    } catch (error) {
      toast.error(authMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handlePasswordReset = async () => {
    if (!email.trim()) {
      toast.info("Enter your email address first");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      toast.success("Password reset email sent");
    } catch (error) {
      toast.error(authMessage(error));
    }
  };

  return (
    <div className="auth-page site-shell">
      <div className="auth-split">
        <section className="auth-visual">
          <a href="/" className="brand-lockup auth-brand"><span className="brand-mark"><span className="brand-mark-dot" /><span className="brand-mark-line brand-mark-line-a" /><span className="brand-mark-line brand-mark-line-b" /></span><span><strong>Tesaka</strong><em>Cherta</em></span></a>
          <div className="auth-visual-copy"><div className="eyebrow light"><span className="eyebrow-line" /> Fair play, made local</div><h1>Your next smart move starts here.</h1><p>One secure account for live auctions, saved products, bid history, and winner updates.</p></div>
          <div className="auth-visual-card"><div className="auth-visual-icon"><Sparkles size={18} /></div><div><strong>Built around clarity</strong><span>See the fee, the rule, and the result before you play.</span></div></div>
          <div className="auth-art-orb auth-art-orb-one" /><div className="auth-art-orb auth-art-orb-two" />
        </section>
        <section className="auth-form-panel">
          <div className="auth-form-top"><a href="/" className="back-link"><ArrowLeft size={15} /> Back to auctions</a><button className="auth-language" onClick={() => setLocation("/")}><Globe2 size={15} /> EN · አማ</button></div>
          <div className="auth-form-card">
            <div className="auth-kicker"><LockKeyhole size={14} /> Secure {supabaseReady ? "Supabase" : "Firebase"} account</div>
            <h2>{isRegister ? "Create your Cherta account." : "Welcome back to Cherta."}</h2>
            <p className="auth-lede">{isRegister ? "Create an account to save auctions and manage your Cherta profile." : "Sign in to see your saved auctions, bid history, and account details."}</p>
            {supabaseReady && <div className="firebase-auth-form">
              <button className="firebase-auth-button" type="button" onClick={handleGoogleSignIn} disabled={googleSubmitting || loading}><span className="firebase-auth-symbol">G</span>{googleSubmitting ? "Redirecting to Google…" : "Continue with Google"}<ArrowUpRight size={16} /></button>
            </div>}
            {supabaseReady && <div className="auth-divider"><span>{isRegister ? "or use email and password" : "or use email and password"}</span></div>}
            <form className="firebase-auth-form" onSubmit={handleSubmit}>
              {isRegister && <label>Full name<input autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={160} /></label>}
              <label>Email address<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
              <label>Password<input type="password" autoComplete={isRegister ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} /></label>
              {!isRegister && <button className="auth-reset-link" type="button" onClick={handlePasswordReset}>Forgot password?</button>}
              <button className="firebase-auth-button" type="submit" disabled={submitting || loading}><span className="firebase-auth-symbol">F</span>{submitting ? "Please wait…" : isRegister ? "Create account" : "Sign in with email"}<ArrowUpRight size={16} /></button>
            </form>
            <div className="auth-divider"><span>Your account, protected</span></div>
            <div className="auth-benefit-list"><div><CheckCircle2 size={16} /><span><strong>{supabaseReady ? "Supabase Authentication" : "Firebase Authentication"}</strong><small>Your password is handled securely by {supabaseReady ? "Supabase" : "Firebase"} Auth.</small></span></div><div><ShieldCheck size={16} /><span><strong>Your bid history stays private</strong><small>Firestore rules restrict account data to its owner.</small></span></div><div><Globe2 size={16} /><span><strong>Built for local participation</strong><small>Choose English or Amharic after you enter.</small></span></div></div>
            <p className="auth-switch">{isRegister ? "Already have an account?" : "New to Tesaka Cherta?"} <button onClick={() => setLocation(isRegister ? "/signin" : "/register")}>{isRegister ? "Sign in" : "Create an account"}</button></p>
          </div>
          <small className="auth-legal">By continuing, you agree to participate fairly and follow the auction rules. Tesaka Cherta will never ask for your password.</small>
        </section>
      </div>
    </div>
  );
}
