import { useEffect } from "react";
import { ArrowLeft, ArrowUpRight, CheckCircle2, Globe2, LockKeyhole, ShieldCheck, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { startLogin } from "@/const";
import { useAuth } from "@/_core/hooks/useAuth";

export default function Auth({ mode = "signin" }: { mode?: "signin" | "register" }) {
  const [, setLocation] = useLocation();
  const { isAuthenticated, loading } = useAuth();
  const isRegister = mode === "register";

  useEffect(() => {
    if (!loading && isAuthenticated) setLocation("/account");
  }, [isAuthenticated, loading, setLocation]);

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
            <div className="auth-kicker"><LockKeyhole size={14} /> Secure account access</div>
            <h2>{isRegister ? "Create your Cherta account." : "Welcome back to Cherta."}</h2>
            <p className="auth-lede">{isRegister ? "Register in one step using your secure Google account. Your Tesaka profile is created automatically after sign-in." : "Sign in to see your saved auctions, bid history, and account details."}</p>
            <button className="oauth-button" onClick={startLogin}><span className="oauth-symbol">G</span>{isRegister ? "Create account with Google" : "Continue with Google"}<ArrowUpRight size={16} /></button>
            <div className="auth-divider"><span>Why this is safe</span></div>
            <div className="auth-benefit-list"><div><CheckCircle2 size={16} /><span><strong>No password stored here</strong><small>Authentication is handled by your secure Supabase account.</small></span></div><div><ShieldCheck size={16} /><span><strong>Your bid history stays private</strong><small>Only you can see account activity and saved products.</small></span></div><div><Globe2 size={16} /><span><strong>Built for local participation</strong><small>Choose English or Amharic after you enter.</small></span></div></div>
            <p className="auth-switch">{isRegister ? "Already have an account?" : "New to Tesaka Cherta?"} <button onClick={() => setLocation(isRegister ? "/signin" : "/register")}>{isRegister ? "Sign in" : "Create an account"}</button></p>
          </div>
          <small className="auth-legal">By continuing, you agree to participate fairly and follow the auction rules. Tesaka Cherta will never ask for your password.</small>
        </section>
      </div>
    </div>
  );
}
