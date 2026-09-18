import { FormEvent, useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowUpRight, CheckCircle2, Clock3, Globe2, Heart, LogOut, MapPin, Phone, Save, ShieldCheck, Sparkles, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

export default function Account() {
  const [, setLocation] = useLocation();
  const { user, loading, logout } = useAuth({ redirectOnUnauthenticated: true, redirectPath: "/signin" });
  const accountQuery = trpc.auth.account.useQuery(undefined, { enabled: Boolean(user), retry: false });
  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Account details saved");
      void accountQuery.refetch();
    },
    onError: (error) => toast.error(error.message || "Could not save account details"),
  });
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [language, setLanguage] = useState<"en" | "am">("en");
  const [marketingOptIn, setMarketingOptIn] = useState(false);

  useEffect(() => {
    const profile = accountQuery.data?.profile;
    if (!profile) return;
    setPhone(profile.phone ?? "");
    setCity(profile.city ?? "");
    setLanguage(profile.language);
    setMarketingOptIn(profile.marketingOptIn === 1);
  }, [accountQuery.data?.profile]);

  const initials = useMemo(() => (user?.name ?? "TC").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(), [user?.name]);
  const handleSave = (event: FormEvent) => {
    event.preventDefault();
    updateProfile.mutate({ phone: phone || null, city: city || null, language, marketingOptIn: marketingOptIn ? 1 : 0 });
  };

  const handleLogout = async () => {
    await logout();
    toast.success("You are signed out");
    setLocation("/");
  };

  if (loading || accountQuery.isLoading) return <div className="account-loading site-shell"><div className="account-loading-mark"><Sparkles size={19} /></div><strong>Loading your account…</strong><span>Getting your Cherta activity ready.</span></div>;

  return (
    <div className="account-page site-shell">
      <header className="account-header container"><a href="/" className="brand-lockup"><span className="brand-mark"><span className="brand-mark-dot" /><span className="brand-mark-line brand-mark-line-a" /><span className="brand-mark-line brand-mark-line-b" /></span><span><strong>Tesaka</strong><em>Cherta</em></span></a><div className="account-header-actions"><a href="/" className="back-link"><ArrowLeft size={15} /> Browse auctions</a><button className="account-logout" onClick={handleLogout}><LogOut size={15} /> Sign out</button></div></header>
      <main className="container account-main">
        <div className="account-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Your Cherta account</div><h1>Good to see you, <em>{user?.name?.split(" ")[0] ?? "member"}.</em></h1><p>Manage your profile, track bids, and keep your next smart move close.</p></div><div className="account-secure-pill"><ShieldCheck size={15} /> Secure account</div></div>
        <div className="account-grid">
          <section className="profile-card account-card"><div className="profile-card-top"><div className="account-avatar">{initials}</div><div><h2>{user?.name ?? "Tesaka member"}</h2><p>{user?.email ?? "Email provided by your secure sign-in"}</p></div></div><div className="profile-rule" /><form onSubmit={handleSave} className="profile-form"><div className="account-field"><label htmlFor="phone"><Phone size={14} /> Phone number</label><input id="phone" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+251 9…" /></div><div className="account-field"><label htmlFor="city"><MapPin size={14} /> City</label><input id="city" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Addis Ababa" /></div><div className="account-field"><label htmlFor="language"><Globe2 size={14} /> Preferred language</label><select id="language" value={language} onChange={(event) => setLanguage(event.target.value as "en" | "am")}><option value="en">English</option><option value="am">አማርኛ</option></select></div><label className="check-row"><input type="checkbox" checked={marketingOptIn} onChange={(event) => setMarketingOptIn(event.target.checked)} /><span>Send me new-auction updates and winner stories.</span></label><button className="primary-button account-save" disabled={updateProfile.isPending}><Save size={15} /> {updateProfile.isPending ? "Saving…" : "Save account details"}</button></form></section>
          <section className="activity-card account-card"><div className="account-card-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Your activity</div><h2>Bid history</h2></div><span className="activity-count">{accountQuery.data?.bids.length ?? 0} bids</span></div>{accountQuery.data?.bids.length ? <div className="activity-list">{accountQuery.data.bids.map((bid) => <div className="activity-row" key={bid.id}><img src={bid.auctionImagePath} alt="" /><div className="activity-row-copy"><strong>{bid.auctionTitle}</strong><span><Clock3 size={12} /> {new Date(bid.createdAt).toLocaleDateString()}</span></div><div className="activity-row-amount"><strong>{bid.amount} ETB</strong><span className={`result-tag ${bid.auctionStatus === "live" ? "tag-live" : ""}`}>{bid.auctionStatus === "live" ? "Live" : "Closed"}</span></div></div>)}</div> : <div className="account-empty"><div className="empty-icon"><Clock3 size={18} /></div><strong>No bids yet</strong><span>When you make your first bid, it will show here.</span><a href="/#auctions" className="text-button">Find a live auction <ArrowUpRight size={14} /></a></div>}</section>
          <section className="saved-card account-card"><div className="account-card-heading"><div><div className="eyebrow"><span className="eyebrow-line" /> Keep watching</div><h2>Saved auctions</h2></div><Heart size={18} className="saved-heart" /></div>{accountQuery.data?.savedAuctions.length ? <div className="saved-list">{accountQuery.data.savedAuctions.map((auction) => <a href={`/#auction-${auction.auctionId}`} className="saved-row" key={auction.id}><img src={auction.imagePath} alt="" /><span><strong>{auction.title}</strong><small>Ends {new Date(auction.endsAt).toLocaleDateString()}</small></span><ArrowUpRight size={15} /></a>)}</div> : <div className="account-empty compact"><div className="empty-icon amber-icon"><Heart size={18} /></div><strong>Nothing saved yet</strong><span>Tap the heart on any auction to keep it close.</span><a href="/#auctions" className="text-button">Browse auctions <ArrowUpRight size={14} /></a></div>}</section>
          <section className="account-trust-card"><div className="account-trust-icon"><CheckCircle2 size={20} /></div><div><strong>Your account is yours.</strong><p>We use your secure sign-in identity to protect bids, saved auctions, and account settings. We never store your password in Tesaka Cherta.</p></div><UserRound size={42} className="account-trust-watermark" /></section>
        </div>
      </main>
    </div>
  );
}
