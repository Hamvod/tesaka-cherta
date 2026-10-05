import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, BadgeCheck, CalendarClock, CircleDollarSign, ClipboardList, LayoutDashboard, LogOut, Plus, RefreshCw, ShieldCheck, Tag, Trophy, Users } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";

type AdminTab = "overview" | "auctions" | "users" | "payments" | "audit";

function localDateTime(date: Date) {
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 16);
}

const initialForm = () => ({
  title: "",
  category: "Phones",
  imagePath: "/manus-storage/tesaka_cherta_phone_74bf5de2.jpg",
  sellerName: "Tesaka Cherta",
  bidFee: "10.00",
  minBid: "0.10",
  maxBid: "100.00",
  maxBidsPerUser: 10,
  startsAt: localDateTime(new Date(Date.now() + 5 * 60000)),
  endsAt: localDateTime(new Date(Date.now() + 3 * 86400000)),
});

const tabs: { id: AdminTab; title: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", title: "Overview", icon: LayoutDashboard },
  { id: "auctions", title: "Auctions", icon: Tag },
  { id: "users", title: "Users", icon: Users },
  { id: "payments", title: "Payments", icon: CircleDollarSign },
  { id: "audit", title: "Audit log", icon: ClipboardList },
];

export default function Admin() {
  const [, setLocation] = useLocation();
  const { user, loading, isAdmin, logout } = useAuth();
  const [tab, setTab] = useState<AdminTab>("overview");
  const [form, setForm] = useState(initialForm);
  const [showCreate, setShowCreate] = useState(false);
  const utils = trpc.useUtils();

  const dashboard = trpc.admin.dashboard.useQuery(undefined, { refetchInterval: 30_000 });
  const auctions = trpc.admin.auctions.useQuery(undefined, { enabled: tab === "auctions" || tab === "overview" });
  const users = trpc.admin.users.useQuery(undefined, { enabled: tab === "users" });
  const payments = trpc.admin.payments.useQuery(undefined, { enabled: tab === "payments" });
  const audit = trpc.admin.audit.useQuery(undefined, { enabled: tab === "audit" || tab === "overview" });
  const createAuction = trpc.admin.createAuction.useMutation({
    onSuccess: async () => {
      toast.success("Auction saved as a draft. Review the dates and publish it when ready.");
      setForm(initialForm());
      setShowCreate(false);
      await Promise.all([utils.admin.auctions.invalidate(), utils.admin.dashboard.invalidate()]);
    },
    onError: (error) => toast.error(error.message),
  });
  const publishAuction = trpc.admin.publishAuction.useMutation({
    onSuccess: async () => {
      toast.success("Auction published.");
      await Promise.all([utils.admin.auctions.invalidate(), utils.auction.list.invalidate(), utils.admin.dashboard.invalidate()]);
    },
    onError: (error) => toast.error(error.message),
  });
  const closeAuction = trpc.admin.closeAuction.useMutation({
    onSuccess: async (result) => {
      toast.success(result.resultType === "winner" ? `Result published: ${result.referenceCode}` : `No unique bid. Result ${result.referenceCode} published.`);
      await Promise.all([utils.admin.auctions.invalidate(), utils.admin.dashboard.invalidate(), utils.admin.audit.invalidate(), utils.auction.results.invalidate(), utils.auction.list.invalidate()]);
    },
    onError: (error) => toast.error(error.message),
  });

  useEffect(() => {
    if (loading) return;
    if (!user) setLocation("/signin");
    else if (!isAdmin) setLocation("/account");
  }, [loading, user, isAdmin, setLocation]);

  const handleSignOut = async () => {
    await logout();
    setLocation("/");
  };

  const submitAuction = (event: FormEvent) => {
    event.preventDefault();
    createAuction.mutate({ ...form, startsAt: new Date(form.startsAt), endsAt: new Date(form.endsAt) });
  };

  const closeSelectedAuction = (auctionId: number, title: string) => {
    const approved = window.confirm(`Close “${title}” and publish its lowest-unique-bid result now? This cannot be undone.`);
    if (approved) closeAuction.mutate({ auctionId });
  };

  if (loading || !user || !isAdmin) {
    return <main className="min-h-screen grid place-items-center bg-[#fbf7ed] text-[#173f36]"><div className="text-center"><ShieldCheck className="mx-auto mb-3 h-8 w-8 text-[#0b5f4a]" /><p className="text-sm font-semibold">Verifying administrator access…</p></div></main>;
  }

  const stats = dashboard.data;
  const statCards = [
    { label: "Users", value: stats?.totalUsers, icon: Users },
    { label: "Live auctions", value: stats?.liveAuctions, icon: Tag },
    { label: "Completed", value: stats?.completedAuctions, icon: Trophy },
    { label: "Bids", value: stats?.totalBids, icon: ClipboardList },
    { label: "Payment orders", value: stats?.paymentOrders, icon: CircleDollarSign },
    { label: "Winners", value: stats?.winners, icon: Trophy },
  ];

  return (
    <main className="min-h-screen bg-[#f8f6ef] text-[#173f36]">
      <header className="sticky top-0 z-20 flex min-h-20 items-center justify-between border-b border-[#e6dccb] bg-[#fffdf8]/95 px-4 backdrop-blur md:px-10">
        <a href="/" className="font-semibold tracking-tight">Tesaka <span className="font-serif italic text-[#b97828]">Cherta</span><span className="ml-3 rounded-full bg-[#e6f0e3] px-2 py-1 text-[10px] font-bold tracking-wide text-[#0b5f4a]">ADMIN</span></a>
        <div className="flex items-center gap-3"><span className="hidden text-sm text-[#6f756b] sm:inline">{user.email}</span><button onClick={handleSignOut} className="inline-flex items-center gap-2 rounded-full border border-[#c7d1c7] px-4 py-2 text-sm font-semibold hover:bg-white"><LogOut size={15} /> Sign out</button></div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-7 px-4 py-7 md:grid-cols-[220px_minmax(0,1fr)] md:px-8">
        <aside className="h-fit rounded-2xl border border-[#e6dccb] bg-[#fffdf8] p-3 md:sticky md:top-24">
          <div className="px-3 py-3"><span className="text-[10px] font-extrabold tracking-[.16em] text-[#a36a29]">CONTROL ROOM</span><h1 className="mt-1 font-serif text-2xl">Admin portal</h1></div>
          <nav className="grid gap-1" aria-label="Admin sections">
            {tabs.map(({ id, title, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold ${tab === id ? "bg-[#e8f0e4] text-[#0b5f4a]" : "text-[#707b70] hover:bg-[#f4f1e8]"}`}><Icon size={17} />{title}</button>)}
          </nav>
          <a href="/" className="mt-4 flex items-center gap-2 border-t border-[#eee6d8] px-3 pt-4 text-sm font-semibold text-[#68766b]"><ArrowLeft size={15} /> Public marketplace</a>
        </aside>

        <section className="min-w-0">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#e4f0e2] px-3 py-1.5 text-[10px] font-extrabold tracking-wide text-[#0b5f4a]"><BadgeCheck size={14} /> FIREBASE ADMIN CLAIM VERIFIED</div><h2 className="font-serif text-4xl tracking-tight">{tabs.find((item) => item.id === tab)?.title}</h2><p className="mt-2 text-sm text-[#737e73]">Manage the auction lifecycle and inspect platform activity.</p></div>
            <button onClick={() => { void dashboard.refetch(); void auctions.refetch(); void audit.refetch(); }} className="inline-flex items-center gap-2 rounded-full border border-[#d7d8c9] bg-white px-4 py-2 text-sm font-bold"><RefreshCw size={14} /> Refresh</button>
          </div>

          {tab === "overview" && <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {statCards.map(({ label, value, icon: StatIcon }) => <article key={label} className="rounded-2xl border border-[#e6dccb] bg-[#fffdf8] p-5"><div className="flex items-center justify-between text-sm font-semibold text-[#737e73]"><span>{label}</span><StatIcon size={18} className="text-[#b97828]" /></div><strong className="mt-3 block font-serif text-4xl">{value ?? "—"}</strong></article>)}
            </div>
            <div className="mt-5 grid gap-5 xl:grid-cols-2">
              <section className="rounded-2xl border border-[#e6dccb] bg-[#fffdf8] p-5"><div className="mb-4 flex items-center justify-between"><h3 className="font-serif text-2xl">Auction queue</h3><button onClick={() => setTab("auctions")} className="text-xs font-bold text-[#0b5f4a]">Manage all →</button></div>{auctions.data?.slice(0, 5).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-t border-[#eee6d8] py-3"><div className="min-w-0"><strong className="block truncate text-sm">{item.title}</strong><span className="text-xs text-[#7b867c]">{item.status} · closes {item.endsAt.toLocaleString()}</span></div><span className="rounded-full bg-[#f1eee5] px-2 py-1 text-[10px] font-bold">#{item.id}</span></div>)}{!auctions.data?.length && <p className="text-sm text-[#7b867c]">No auctions yet. Create the first one in the Auctions tab.</p>}</section>
              <section className="rounded-2xl border border-[#e6dccb] bg-[#fffdf8] p-5"><div className="mb-4 flex items-center justify-between"><h3 className="font-serif text-2xl">Recent audit events</h3><button onClick={() => setTab("audit")} className="text-xs font-bold text-[#0b5f4a]">Audit history →</button></div>{audit.data?.slice(0, 6).map((item) => <div key={item.id} className="border-t border-[#eee6d8] py-3"><strong className="block text-sm">{item.action}</strong><span className="text-xs text-[#7b867c]">{item.entityType} #{item.entityId} · {item.createdAt.toLocaleString()}</span></div>)}{!audit.data?.length && <p className="text-sm text-[#7b867c]">Audit events appear when platform actions are recorded.</p>}</section>
            </div>
          </>}

          {tab === "auctions" && <>
            <div className="mb-4 flex justify-end"><button onClick={() => setShowCreate(!showCreate)} className="inline-flex items-center gap-2 rounded-full bg-[#0b5f4a] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#084a3a]"><Plus size={16} /> {showCreate ? "Close form" : "Create auction"}</button></div>
            {showCreate && <form onSubmit={submitAuction} className="mb-5 grid gap-3 rounded-2xl border border-[#d8dfd1] bg-[#fffdf8] p-5 sm:grid-cols-2 xl:grid-cols-3">
              <label className="grid gap-1 text-xs font-bold">Product / auction title<input required maxLength={220} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2 text-sm font-normal" /></label>
              <label className="grid gap-1 text-xs font-bold">Category<input required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2 text-sm font-normal" /></label>
              <label className="grid gap-1 text-xs font-bold">Seller / owner display name<input required value={form.sellerName} onChange={(e) => setForm({ ...form, sellerName: e.target.value })} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2 text-sm font-normal" /></label>
              <label className="grid gap-1 text-xs font-bold">Product image URL or path<input required value={form.imagePath} onChange={(e) => setForm({ ...form, imagePath: e.target.value })} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2 text-sm font-normal" /></label>
              <label className="grid gap-1 text-xs font-bold">Bid service fee (ETB)<input required inputMode="decimal" value={form.bidFee} onChange={(e) => setForm({ ...form, bidFee: e.target.value })} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2 text-sm font-normal" /></label>
              <label className="grid gap-1 text-xs font-bold">Min bid (ETB)<input required inputMode="decimal" value={form.minBid} onChange={(e) => setForm({ ...form, minBid: e.target.value })} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2 text-sm font-normal" /></label>
              <label className="grid gap-1 text-xs font-bold">Max bid (ETB)<input required inputMode="decimal" value={form.maxBid} onChange={(e) => setForm({ ...form, maxBid: e.target.value })} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2 text-sm font-normal" /></label>
              <label className="grid gap-1 text-xs font-bold">Max bids per user<input required type="number" min={1} max={100} value={form.maxBidsPerUser} onChange={(e) => setForm({ ...form, maxBidsPerUser: Number(e.target.value) })} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2 text-sm font-normal" /></label>
              <label className="grid gap-1 text-xs font-bold">Starts at<input required type="datetime-local" value={form.startsAt} onChange={(e) => setForm({ ...form, startsAt: e.target.value })} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2 text-sm font-normal" /></label>
              <label className="grid gap-1 text-xs font-bold">Ends at<input required type="datetime-local" value={form.endsAt} onChange={(e) => setForm({ ...form, endsAt: e.target.value })} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2 text-sm font-normal" /></label>
              <div className="flex items-end"><button disabled={createAuction.isPending} className="w-full rounded-lg bg-[#0b5f4a] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60">{createAuction.isPending ? "Saving…" : "Save as draft"}</button></div>
              <p className="sm:col-span-2 xl:col-span-3 text-xs leading-5 text-[#737e73]">Creating an auction does not publish it. Review rules and dates, then publish from the queue. Keep real-money entry disabled until provider verification and compliance review are complete.</p>
            </form>}
            <div className="grid gap-3">{auctions.data?.map((item) => <article key={item.id} className="grid gap-4 rounded-2xl border border-[#e6dccb] bg-[#fffdf8] p-4 sm:grid-cols-[64px_minmax(0,1fr)_auto] sm:items-center"><img src={item.imagePath} alt="" className="h-16 w-16 rounded-xl object-cover" /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold">{item.title}</h3><span className={`rounded-full px-2 py-1 text-[10px] font-extrabold uppercase ${item.status === "live" ? "bg-[#e4f0e2] text-[#0b5f4a]" : item.status === "closed" ? "bg-[#f3e8dc] text-[#9b5921]" : "bg-[#f1eee5] text-[#737e73]"}`}>{item.startsAt.getTime() > Date.now() && item.status === "live" ? "upcoming" : item.status}</span></div><p className="mt-1 text-xs text-[#737e73]">{item.category} · {item.sellerName} · fee {item.bidFee} ETB · {item.maxBidsPerUser} bids/user</p><p className="mt-1 text-xs text-[#879086]">Starts {item.startsAt.toLocaleString()} · Ends {item.endsAt.toLocaleString()}</p></div><div className="flex gap-2">{item.status === "draft" && <button disabled={publishAuction.isPending} onClick={() => publishAuction.mutate({ auctionId: item.id })} className="rounded-full border border-[#c9d7c9] px-3 py-2 text-xs font-bold text-[#0b5f4a]">Publish</button>}{item.status === "live" && <button disabled={closeAuction.isPending} onClick={() => closeSelectedAuction(item.id, item.title)} className="rounded-full border border-[#e4c8a8] px-3 py-2 text-xs font-bold text-[#9a5c24]">Close + calculate</button>}</div></article>)}{auctions.isLoading && <p className="p-8 text-center text-sm text-[#737e73]">Loading auctions…</p>}{auctions.data?.length === 0 && <p className="rounded-2xl border border-dashed border-[#d7d8c9] p-8 text-center text-sm text-[#737e73]">No auctions found.</p>}</div>
          </>}

          {tab === "users" && <section className="grid gap-3">{users.data?.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e6dccb] bg-[#fffdf8] p-4"><div><strong>{item.name || "Cherta member"}</strong><p className="text-sm text-[#737e73]">{item.email || "No email"}</p></div><div className="text-right text-xs text-[#737e73]"><span className="rounded-full bg-[#e8f0e4] px-2 py-1 font-bold text-[#0b5f4a]">{item.role}</span><p className="mt-2">Last sign-in {item.lastSignedIn.toLocaleString()}</p></div></article>)}{users.isLoading && <p className="p-8 text-center text-sm">Loading users…</p>}{users.data?.length === 0 && <p className="rounded-2xl border border-dashed border-[#d7d8c9] p-8 text-center">No user records yet.</p>}</section>}

          {tab === "payments" && <><div className="mb-4 rounded-xl border border-[#ead4ad] bg-[#fff5db] p-4 text-sm leading-6 text-[#74562a]">Payment orders are shown for monitoring. Telebirr callbacks are only recorded as pending verification; no callback can mark a payment paid until a provider-specific signature/transaction check is implemented. Sandbox settlement is non-production only.</div><section className="grid gap-3">{payments.data?.map((item) => <article key={item.id} className="grid gap-2 rounded-2xl border border-[#e6dccb] bg-[#fffdf8] p-4 sm:grid-cols-[1fr_auto]"><div><strong>{item.auctionTitle}</strong><p className="text-xs text-[#737e73]">{item.userEmail} · {item.provider} · {item.merchantReference}</p><p className="mt-1 text-xs text-[#879086]">{item.createdAt.toLocaleString()}</p></div><div className="text-right"><strong>{item.amount} {item.currency}</strong><span className={`mt-1 block text-xs font-bold uppercase ${item.status === "paid" ? "text-[#0b5f4a]" : "text-[#9a5c24]"}`}>{item.status}</span></div></article>)}{payments.isLoading && <p className="p-8 text-center text-sm">Loading payments…</p>}{payments.data?.length === 0 && <p className="rounded-2xl border border-dashed border-[#d7d8c9] p-8 text-center">No payment orders yet.</p>}</section></>}

          {tab === "audit" && <section className="grid gap-3">{audit.data?.map((item) => <article key={item.id} className="rounded-2xl border border-[#e6dccb] bg-[#fffdf8] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong>{item.action}</strong><span className="text-xs text-[#737e73]">{item.createdAt.toLocaleString()}</span></div><p className="mt-1 text-xs text-[#737e73]">Actor #{item.actorId ?? "system"} · {item.entityType} #{item.entityId}</p>{item.newValue !== null && item.newValue !== undefined ? <pre className="mt-3 overflow-x-auto rounded-lg bg-[#f5f2e9] p-3 text-[11px] text-[#59645a]">{JSON.stringify(item.newValue, null, 2)}</pre> : null}</article>)}{audit.isLoading && <p className="p-8 text-center text-sm">Loading audit log…</p>}{audit.data?.length === 0 && <p className="rounded-2xl border border-dashed border-[#d7d8c9] p-8 text-center">No audit records yet.</p>}</section>}
        </section>
      </div>
    </main>
  );
}
