import { FormEvent, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { ArrowLeft, ArrowUpRight, CheckCircle2, Clock3, Globe2, Heart, LogOut, MapPin, Phone, Save, ShieldCheck, Sparkles, Trophy, UserRound } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { getAccountData, listUserReports, saveAccountProfile, submitUserReport, type AccountProfile, type ReportRecord } from "@/lib/firebaseData";

export default function Account() {
  const [, setLocation] = useLocation();
  const { user, loading, logout, isSuspended } = useAuth();
  const queryClient = useQueryClient();
  const accountQuery = useQuery({ queryKey: ["firestore-account", user?.uid], queryFn: () => getAccountData(user!.uid), enabled: Boolean(user) });
  const reportsQuery = useQuery({ queryKey: ["firestore-reports", user?.uid], queryFn: () => listUserReports(user!.uid), enabled: Boolean(user) });
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [language, setLanguage] = useState<"en" | "am">("en");
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reportCategory, setReportCategory] = useState<ReportRecord["category"]>("other");
  const [reportSubject, setReportSubject] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [submittingReport, setSubmittingReport] = useState(false);
  const initials = (user?.name ?? "TC").split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  useEffect(() => {
    if (!loading && !user) setLocation("/signin");
  }, [loading, user, setLocation]);

  useEffect(() => {
    const profile = accountQuery.data?.profile;
    if (!profile) return;
    setPhone(profile.phone ?? "");
    setCity(profile.city ?? "");
    setLanguage(profile.language);
    setMarketingOptIn(profile.marketingOptIn);
    localStorage.setItem("cherta-language", profile.language);
  }, [accountQuery.data?.profile]);

  const handleSave = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || isSuspended) return;
    setSaving(true);
    const profile: AccountProfile = { phone: phone.trim() || null, city: city.trim() || null, language, marketingOptIn };
    try {
      await saveAccountProfile(user.uid, profile);
      await queryClient.invalidateQueries({ queryKey: ["firestore-account", user.uid] });
      localStorage.setItem("cherta-language", language);
      toast.success("Account details saved to Firestore.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save account details.");
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    toast.success("You are signed out");
    setLocation("/");
  };

  const handleSubmitReport = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || isSuspended) return;
    setSubmittingReport(true);
    try {
      await submitUserReport(user.uid, { category: reportCategory, subject: reportSubject, details: reportDetails });
      setReportSubject("");
      setReportDetails("");
      await queryClient.invalidateQueries({ queryKey: ["firestore-reports", user.uid] });
      toast.success("Report sent to the administrator.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not submit report.");
    } finally {
      setSubmittingReport(false);
    }
  };

  if (loading || (user && accountQuery.isLoading)) return <div className="account-loading site-shell"><div className="account-loading-mark"><Sparkles size={19} /></div><strong>Loading your account…</strong><span>Getting your Cherta activity ready.</span></div>;
  if (!user) return null;

  const accountData = accountQuery.data;
  const bids = accountData?.bids ?? [];
  const wins = bids.filter((bid) => bid.isWinningBid);

  return (
    <div className="account-page site-shell">
      <header className="account-header container"><a href="/" className="brand-lockup"><span className="brand-mark"><span className="brand-mark-dot" /><span className="brand-mark-line brand-mark-line-a" /><span className="brand-mark-line brand-mark-line-b" /></span><span><strong>Tesaka</strong><em>Cherta</em></span></a><div className="account-header-actions"><a href="/" className="back-link"><ArrowLeft size={15} /> Browse auctions</a><button className="account-logout" onClick={() => void handleLogout()}><LogOut size={15} /> Sign out</button></div></header>
      <main className="container account-main">
        <div className="account-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Your Cherta account</div><h1>Good to see you, <em>{user.name.split(" ")[0]}.</em></h1><p>Manage your profile, track bids, and keep your next smart move close.</p></div><div className="account-secure-pill"><ShieldCheck size={15} /> Firebase account</div></div>
        {isSuspended && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-800">This account is suspended. Profile updates, reports, and bidding are disabled; contact the Cherta administrator.</div>}
        {accountQuery.isError && <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Could not load Firestore account data. Check Firebase Authentication and Firestore security rules.</div>}
        <div className="account-grid">
          <section className="profile-card account-card"><div className="profile-card-top"><div className="account-avatar">{initials}</div><div><h2>{user.name}</h2><p>{user.email ?? "Email provided by Firebase Auth"}</p></div></div><div className="profile-rule" /><form onSubmit={(event) => void handleSave(event)} className="profile-form"><div className="account-field"><label htmlFor="phone"><Phone size={14} /> Phone number</label><input id="phone" value={phone} disabled={isSuspended} onChange={(event) => setPhone(event.target.value)} placeholder="+251 9…" /></div><div className="account-field"><label htmlFor="city"><MapPin size={14} /> City</label><input id="city" value={city} disabled={isSuspended} onChange={(event) => setCity(event.target.value)} placeholder="Addis Ababa" /></div><div className="account-field"><label htmlFor="language"><Globe2 size={14} /> Preferred language</label><select id="language" value={language} disabled={isSuspended} onChange={(event) => setLanguage(event.target.value as "en" | "am")}><option value="en">English</option><option value="am">አማርኛ</option></select></div><label className="check-row"><input type="checkbox" checked={marketingOptIn} disabled={isSuspended} onChange={(event) => setMarketingOptIn(event.target.checked)} /><span>Send me new-auction updates and winner stories.</span></label><button className="primary-button account-save" disabled={saving || isSuspended}><Save size={15} /> {saving ? "Saving…" : "Save account details"}</button></form></section>
          <section className="activity-card account-card"><div className="account-card-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Your activity</div><h2>Bid history</h2></div><span className="activity-count">{bids.length} bids</span></div>{bids.length ? <div className="activity-list">{bids.map((bid) => <div className="activity-row" key={bid.id}><img src={bid.auctionImagePath} alt="" /><div className="activity-row-copy"><strong>{bid.auctionTitle}</strong><span><Clock3 size={12} /> {bid.createdAt.toLocaleDateString()}</span></div><div className="activity-row-amount"><strong>{bid.amount.toFixed(2)} ETB</strong><span className={`result-tag ${bid.isWinningBid ? "tag-live" : bid.auctionStatus === "live" ? "tag-live" : ""}`}>{bid.isWinningBid ? "Winner" : bid.auctionStatus === "live" ? "Live" : "Closed"}</span></div></div>)}</div> : <div className="account-empty"><div className="empty-icon"><Clock3 size={18} /></div><strong>{accountQuery.isLoading ? "Loading bid history…" : "No bids yet"}</strong><span>{accountQuery.isError ? "Bid history is temporarily unavailable." : "When you make your first bid, it will show here."}</span>{!accountQuery.isError && <a href="/#auctions" className="text-button">Find a live auction <ArrowUpRight size={14} /></a>}</div>}</section>
          <section className="saved-card account-card"><div className="account-card-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Outcomes</div><h2>Won auctions</h2></div><Sparkles size={18} className="saved-heart" /></div>{wins.length ? <div className="saved-list">{wins.map((win) => <div className="saved-row" key={win.id}><img src={win.auctionImagePath} alt="" /><span><strong>{win.auctionTitle}</strong><small>{win.amount.toFixed(2)} ETB · {win.createdAt.toLocaleDateString()}</small></span><Trophy size={15} /></div>)}</div> : <div className="account-empty compact"><div className="empty-icon amber-icon"><Sparkles size={18} /></div><strong>No wins yet</strong><span>Winning bids appear here after the admin publishes an auction result.</span></div>}</section>
          <section className="saved-card account-card"><div className="account-card-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Keep watching</div><h2>Saved auctions</h2></div><Heart size={18} className="saved-heart" /></div>{accountData?.savedAuctions.length ? <div className="saved-list">{accountData.savedAuctions.map((auction) => <a href={`/#auction-${auction.auctionId}`} className="saved-row" key={auction.id}><img src={auction.imagePath} alt="" /><span><strong>{auction.title}</strong><small>Ends {auction.endsAt.toLocaleDateString()}</small></span><ArrowUpRight size={15} /></a>)}</div> : <div className="account-empty compact"><div className="empty-icon amber-icon"><Heart size={18} /></div><strong>Nothing saved yet</strong><span>Tap the heart on any auction to keep it close.</span><a href="/#auctions" className="text-button">Browse auctions <ArrowUpRight size={14} /></a></div>}</section>
          <section className="account-trust-card"><div className="account-trust-icon"><CheckCircle2 size={20} /></div><div><strong>Your account is yours.</strong><p>Firebase Authentication protects sign-in and Firestore security rules isolate private account data.</p></div><UserRound size={42} className="account-trust-watermark" /></section>
        </div>
        <section className="account-card mt-6 rounded-2xl border border-[#e6dccb] bg-[#fffdf8] p-5 sm:p-7">
          <div className="mb-5 flex flex-wrap items-start justify-between gap-3"><div><div className="eyebrow"><span className="eyebrow-line" /> Help and safety</div><h2 className="mt-2 font-serif text-3xl">Report a problem</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-[#737e73]">Only administrators can read report details. Do not include passwords or payment-card details.</p></div><span className="rounded-full bg-[#f1eee5] px-3 py-1.5 text-xs font-bold text-[#68766b]">{reportsQuery.data?.length ?? 0} reports</span></div>
          <form onSubmit={(event) => void handleSubmitReport(event)} className="grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-bold">Category<select value={reportCategory} disabled={isSuspended} onChange={(event) => setReportCategory(event.target.value as ReportRecord["category"])} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2.5 text-sm font-normal"><option value="account">Account</option><option value="auction">Auction</option><option value="payment">Payment</option><option value="safety">Safety concern</option><option value="other">Other</option></select></label>
            <label className="grid gap-1 text-xs font-bold">Subject<input required minLength={4} maxLength={160} disabled={isSuspended} value={reportSubject} onChange={(event) => setReportSubject(event.target.value)} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2.5 text-sm font-normal" placeholder="Briefly describe the issue" /></label>
            <label className="grid gap-1 text-xs font-bold md:col-span-2">Details<textarea required minLength={20} maxLength={4000} rows={5} disabled={isSuspended} value={reportDetails} onChange={(event) => setReportDetails(event.target.value)} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2.5 text-sm font-normal" placeholder="Include relevant context, but do not include passwords or payment-card details." /></label>
            <div className="flex items-center justify-between gap-3 md:col-span-2"><span className="text-xs text-[#7b867c]">Report data is written directly to Firestore.</span><button disabled={submittingReport || isSuspended} className="rounded-full bg-[#0b5f4a] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{submittingReport ? "Sending…" : "Submit report"}</button></div>
          </form>
          <div className="mt-6 grid gap-2">{reportsQuery.data?.map((report) => <article key={report.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eee6d8] py-3"><div><strong className="text-sm">{report.subject}</strong><p className="mt-1 text-xs text-[#7b867c]">{report.category} · {report.createdAt.toLocaleString()}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${report.status === "resolved" ? "bg-[#e8f0e4] text-[#0b5f4a]" : report.status === "dismissed" ? "bg-[#f1eee5] text-[#737e73]" : "bg-[#fff1d8] text-[#8c5b1a]"}`}>{report.status.replace("_", " ")}</span></article>)}{reportsQuery.isError && <p className="border-t border-[#eee6d8] pt-3 text-xs text-[#9b3929]">Report history is temporarily unavailable.</p>}</div>
        </section>
      </main>
    </div>
  );
}
