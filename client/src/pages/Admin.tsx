import { useEffect } from "react";
import { ArrowLeft, LogOut, ShieldCheck } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";

export default function Admin() {
  const [, setLocation] = useLocation();
  const { user, loading, isAdmin, logout } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) setLocation("/signin");
    else if (!isAdmin) setLocation("/account");
  }, [loading, user, isAdmin, setLocation]);

  const handleSignOut = async () => {
    await logout();
    setLocation("/");
  };

  if (loading || !user || !isAdmin) {
    return (
      <main className="min-h-screen grid place-items-center bg-[#fbf7ed] text-[#173f36]">
        <div className="text-center">
          <ShieldCheck className="mx-auto mb-3 h-8 w-8 text-[#0b5f4a]" />
          <p className="text-sm font-semibold">Verifying administrator access…</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#fbf7ed] text-[#173f36]">
      <header className="flex h-20 items-center justify-between border-b border-[#e6dccb] px-6 md:px-12">
        <a href="/" className="font-semibold tracking-tight">Tesaka <span className="font-serif italic text-[#b97828]">Cherta</span></a>
        <div className="flex items-center gap-4">
          <span className="hidden text-sm text-[#6f756b] sm:inline">{user.email}</span>
          <button onClick={handleSignOut} className="inline-flex items-center gap-2 rounded-full border border-[#c7d1c7] px-4 py-2 text-sm font-semibold hover:bg-white" aria-label="Sign out">
            <LogOut size={15} /> Sign out
          </button>
        </div>
      </header>
      <section className="mx-auto max-w-5xl px-6 py-16 md:px-12">
        <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#e4f0e2] px-3 py-1.5 text-xs font-bold text-[#0b5f4a]">
          <ShieldCheck size={15} /> ADMIN ACCESS VERIFIED
        </div>
        <h1 className="font-serif text-5xl tracking-tight md:text-6xl">Admin dashboard</h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-[#6f756b]">
          Signed in as {user.email}. This page is restricted by a Firebase custom claim and the server validates that claim from the signed ID token.
        </p>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          <article className="rounded-2xl border border-[#e6dccb] bg-[#fffdf7] p-6">
            <ShieldCheck className="mb-4 h-6 w-6 text-[#0b5f4a]" />
            <h2 className="text-lg font-bold">Administrator identity</h2>
            <p className="mt-2 break-all text-sm text-[#6f756b]">{user.uid}</p>
          </article>
          <article className="rounded-2xl border border-[#e6dccb] bg-[#fffdf7] p-6">
            <h2 className="text-lg font-bold">Workspace status</h2>
            <p className="mt-2 text-sm leading-6 text-[#6f756b]">Administrator sign-in and route protection are active. Auction and payment management actions have not been added to this page.</p>
          </article>
        </div>
        <button onClick={() => setLocation("/")} className="mt-8 inline-flex items-center gap-2 text-sm font-bold text-[#0b5f4a] hover:text-[#b97828]">
          <ArrowLeft size={15} /> Return to auctions
        </button>
      </section>
    </main>
  );
}
