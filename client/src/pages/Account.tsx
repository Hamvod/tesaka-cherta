import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpRight, CheckCircle2, Clock3, Globe2, Heart, LogOut, MapPin, Phone, Save, ShieldCheck, Sparkles, Trophy, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { getAccountData, saveAccountProfile, type FirestoreAccountData } from "@/lib/firebaseData";
import { trpc } from "@/lib/trpc";

export default function Account() {
  const [, setLocation] = useLocation();
  const { user, loading, logout } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/signin" });
  const bidHistory = trpc.auction.myBids.useQuery(undefined, { enabled: Boolean(user) });
  const myWins = trpc.auction.myWins.useQuery(undefined, { enabled: Boolean(user) });
  const session = trpc.auth.me.useQuery(undefined, { enabled: Boolean(user) });
  const myReports = trpc.support.myReports.useQuery(undefined, { enabled: Boolean(user) });
  const syncProfile = trpc.profile.sync.useMutation();
  const utils = trpc.useUtils();
  const [reportCategory, setReportCategory] = useState<"account" | "auction" | "payment" | "safety" | "other">("account");
  const [reportSubject, setReportSubject] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const submitReport = trpc.support.submitReport.useMutation({
    onSuccess: async () => {
      toast.success("Your report was sent to the support team.");
      setReportSubject("");
      setReportDetails("");
      await utils.support.myReports.invalidate();
      await utils.admin.dashboard.invalidate();
    },
    onError: (error) => toast.error(error.message),
  });
  const [accountData, setAccountData] = useState<FirestoreAccountData | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [language, setLanguage] = useState<"en" | "am">("en");
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  useEffect(() => {
    if (!user) return;
    let active = true;
    setDataLoading(true);
    void getAccountData(user.uid).then((data) => {
      if (!active) return;
      setAccountData(data);
      setPhone(data.profile.phone ?? "");
      setCity(data.profile.city ?? "");
      setLanguage(data.profile.language);
      localStorage.setItem("cherta-language", data.profile.language);
      setMarketingOptIn(data.profile.marketingOptIn);
    }).catch((error: unknown) => {
      if (active) toast.error(error instanceof Error ? error.message : "Could not load your Firestore account data");
    }).finally(() => { if (active) setDataLoading(false); });
    return () => { active = false; };
  }, [user?.uid]);

  const initials = useMemo(() => (user?.name ?? "TC").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(), [user?.name]);
  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const profile = { phone: phone || null, city: city || null, language, marketingOptIn };
      await saveAccountProfile(user.uid, profile);
      let serverSynced = true;
      try {
        await syncProfile.mutateAsync(profile);
      } catch {
        serverSynced = false;
        toast.warning("Profile saved to Firebase. The transaction database did not sync, so a phone number may not appear on a public winner card yet.");
      }
      localStorage.setItem("cherta-language", language);
      setAccountData((current) => current ? { ...current, profile } : current);
      if (serverSynced) toast.success("Account details saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save account details");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    toast.success("You are signed out");
    setLocation("/");
  };

  const handleSubmitReport = (event: FormEvent) => {
    event.preventDefault();
    submitReport.mutate({ category: reportCategory, subject: reportSubject, details: reportDetails });
  };

  if (loading || dataLoading) return <div className="account-loading site-shell"><div className="account-loading-mark"><Sparkles size={19} /></div><strong>Loading your account…</strong><span>Getting your Cherta activity ready.</span></div>;
  if (session.data?.status === "suspended") return <main className="grid min-h-screen place-items-center bg-[#fbf7ed] px-5 text-[#173f36]"><section className="max-w-lg rounded-3xl border border-[#e6dccb] bg-[#fffdf8] p-8 text-center shadow-sm"><ShieldCheck className="mx-auto mb-4 h-10 w-10 text-[#9b3929]" /><h1 className="font-serif text-3xl">Account temporarily suspended</h1><p className="mt-3 text-sm leading-6 text-[#737e73]">Protected account actions are unavailable. If you believe this is an error, sign out and contact the Cherta support team.</p><button onClick={handleLogout} className="mt-6 rounded-full bg-[#0b5f4a] px-5 py-2.5 text-sm font-bold text-white">Sign out</button></section></main>;

  return (
    <div className="account-page site-shell">
      <header className="account-header container"><a href="/" className="brand-lockup"><span className="brand-mark"><span className="brand-mark-dot" /><span className="brand-mark-line brand-mark-line-a" /><span className="brand-mark-line brand-mark-line-b" /></span><span><strong>Tesaka</strong><em>Cherta</em></span></a><div className="account-header-actions"><a href="/" className="back-link"><ArrowLeft size={15} /> Browse auctions</a><button className="account-logout" onClick={handleLogout}><LogOut size={15} /> Sign out</button></div></header>
      <main className="container account-main">
        <div className="account-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Your Cherta account</div><h1>Good to see you, <em>{user?.name?.split(" ")[0] ?? "member"}.</em></h1><p>Manage your profile, track bids, and keep your next smart move close.</p></div><div className="account-secure-pill"><ShieldCheck size={15} /> Secure account</div></div>
        <div className="account-grid">
          <section className="profile-card account-card"><div className="profile-card-top"><div className="account-avatar">{initials}</div><div><h2>{user?.name ?? "Tesaka member"}</h2><p>{user?.email ?? "Email provided by Firebase Auth"}</p></div></div><div className="profile-rule" /><form onSubmit={handleSave} className="profile-form"><div className="account-field"><label htmlFor="phone"><Phone size={14} /> Phone number</label><input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+251 9…" /></div><div className="account-field"><label htmlFor="city"><MapPin size={14} /> City</label><input id="city" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Addis Ababa" /></div><div className="account-field"><label htmlFor="language"><Globe2 size={14} /> Preferred language</label><select id="language" value={language} onChange={(event) => setLanguage(event.target.value as "en" | "am")}><option value="en">English</option><option value="am">አማርኛ</option></select></div><label className="check-row"><input type="checkbox" checked={marketingOptIn} onChange={(event) => setMarketingOptIn(event.target.checked)} /><span>Send me new-auction updates and winner stories.</span></label><button className="primary-button account-save" disabled={saving}><Save size={15} /> {saving ? "Saving…" : "Save account details"}</button></form></section>
          <section className="activity-card account-card"><div className="account-card-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Your activity</div><h2>Bid history</h2></div><span className="activity-count">{bidHistory.data?.length ?? 0} bids</span></div>{bidHistory.data?.length ? <div className="activity-list">{bidHistory.data.map((bid) => <div className="activity-row" key={bid.id}><img src={bid.auctionImagePath} alt="" /><div className="activity-row-copy"><strong>{bid.auctionTitle}</strong><span><Clock3 size={12} /> {bid.createdAt.toLocaleDateString()}</span></div><div className="activity-row-amount"><strong>{bid.amount} ETB</strong><span className={`result-tag ${bid.isWinningBid ? "tag-live" : bid.status === "valid" && bid.auctionStatus === "live" ? "tag-live" : ""}`}>{bid.status === "invalid" ? "Invalid" : bid.isWinningBid ? "Winner" : bid.auctionStatus === "live" ? "Live" : bid.resultType ? "Result published" : "Closed"}</span></div></div>)}</div> : <div className="account-empty"><div className="empty-icon"><Clock3 size={18} /></div><strong>{bidHistory.isLoading ? "Loading bid history…" : "No bids yet"}</strong><span>{bidHistory.isError ? "Bid history is temporarily unavailable." : "When you make your first bid, it will show here."}</span>{!bidHistory.isError && <a href="/#auctions" className="text-button">Find a live auction <ArrowUpRight size={14} /></a>}</div>}</section>
          <section className="saved-card account-card"><div className="account-card-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Outcomes</div><h2>Won auctions</h2></div><Sparkles size={18} className="saved-heart" /></div>{myWins.data?.length ? <div className="saved-list">{myWins.data.map((win) => <div className="saved-row" key={win.auctionId}><img src={win.imagePath} alt="" /><span><strong>{win.title}</strong><small>{win.winningAmount} ETB · {win.referenceCode} · {win.publishedAt?.toLocaleDateString()}</small></span><Trophy size={15} /></div>)}</div> : <div className="account-empty compact"><div className="empty-icon amber-icon"><Sparkles size={18} /></div><strong>{myWins.isLoading ? "Loading results…" : "No wins yet"}</strong><span>{myWins.isError ? "Won-auction records are temporarily unavailable." : "If you win an auction, the published result will appear here."}</span></div>}</section>
          <section className="saved-card account-card"><div className="account-card-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Keep watching</div><h2>Saved auctions</h2></div><Heart size={18} className="saved-heart" /></div>{accountData?.savedAuctions.length ? <div className="saved-list">{accountData.savedAuctions.map((auction) => <a href={`/#auction-${auction.auctionId}`} className="saved-row" key={auction.id}><img src={auction.imagePath} alt="" /><span><strong>{auction.title}</strong><small>Ends {auction.endsAt.toLocaleDateString()}</small></span><ArrowUpRight size={15} /></a>)}</div> : <div className="account-empty compact"><div className="empty-icon amber-icon"><Heart size={18} /></div><strong>Nothing saved yet</strong><span>Tap the heart on any auction to keep it close.</span><a href="/#auctions" className="text-button">Browse auctions <ArrowUpRight size={14} /></a></div>}</section>
          <section className="account-trust-card"><div className="account-trust-icon"><CheckCircle2 size={20} /></div><div><strong>Your account is yours.</strong><p>Firebase Authentication protects your sign-in and Firestore security rules restrict profile and saved-auction data to your account.</p></div><UserRound size={42} className="account-trust-watermark" /></section>
        </div>
        <section className="account-card mt-6 rounded-2xl border border-[#e6dccb] bg-[#fffdf8] p-5 sm:p-7">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><div className="eyebrow"><span className="eyebrow-line" /> Help and safety</div><h2 className="mt-2 font-serif text-3xl">Report a problem</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#737e73]">Send a complaint about your account, an auction, a payment, or a safety concern. Only administrators can read report details.</p></div><span className="rounded-full bg-[#f1eee5] px-3 py-1.5 text-xs font-bold text-[#68766b]">{myReports.data?.length ?? 0} reports</span></div>
          <form onSubmit={handleSubmitReport} className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-bold">Category<select value={reportCategory} onChange={(event) => setReportCategory(event.target.value as typeof reportCategory)} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2.5 text-sm font-normal"><option value="account">Account</option><option value="auction">Auction</option><option value="payment">Payment</option><option value="safety">Safety concern</option><option value="other">Other</option></select></label>
            <label className="grid gap-1 text-xs font-bold">Subject<input required minLength={4} maxLength={160} value={reportSubject} onChange={(event) => setReportSubject(event.target.value)} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2.5 text-sm font-normal" placeholder="Briefly describe the issue" /></label>
            <label className="grid gap-1 text-xs font-bold md:col-span-2">Details<textarea required minLength={20} maxLength={4000} rows={5} value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2.5 text-sm font-normal" placeholder="Include relevant context, but do not include passwords or payment-card details." /></label>
            <div className="flex items-center justify-between gap-3 md:col-span-2"><span className="text-xs text-[#7b867c]">Limit: 5 reports per hour. Never include passwords or card numbers.</span><button disabled={submitReport.isPending} className="rounded-full bg-[#0b5f4a] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{submitReport.isPending ? "Sending…" : "Submit report"}</button></div>
          </form>
          <div className="mt-6 grid gap-2">{myReports.data?.map((report) => <article key={report.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eee6d8] py-3"><div><strong className="text-sm">{report.subject}</strong><p className="mt-1 text-xs text-[#7b867c]">{report.category} · {report.createdAt.toLocaleString()}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${report.status === "resolved" ? "bg-[#e8f0e4] text-[#0b5f4a]" : report.status === "dismissed" ? "bg-[#f1eee5] text-[#737e73]" : "bg-[#fff1d8] text-[#8c5b1a]"}`}>{report.status.replace("_", " ")}</span></article>)}{myReports.isError && <p className="border-t border-[#eee6d8] pt-3 text-xs text-[#9b3929]">Report history is temporarily unavailable.</p>}</div>
        </section>
      </main>
    </div>
  );
}
