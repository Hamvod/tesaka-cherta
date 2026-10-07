import { FormEvent, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { ArrowLeft, BadgeCheck, Ban, CircleDollarSign, ClipboardList, Flag, LayoutDashboard, LogOut, Plus, RefreshCw, ShieldCheck, Tag, Trophy, Users, UserRoundCheck } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { closeFirestoreAuction, createFirestoreAuction, createManualPaymentRecord, getAdminDashboardStats, listAdminAuctions, listAdminAudit, listAdminPayments, listAdminReports, listAdminUsers, publishFirestoreAuction, reviewFirestoreReport, updateFirestoreUserStatus, type AuctionRecord, type ReportRecord, type UserRecord } from "@/lib/firebaseData";

type AdminTab = "overview" | "auctions" | "users" | "reports" | "payments" | "audit";
const dateTimeValue = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const initialForm = () => ({
  title: "", category: "Phones", imagePath: "", sellerName: "Tesaka Cherta", bidFee: "10.00", minBid: "0.10", maxBid: "100.00", maxBidsPerUser: 10,
  startsAt: dateTimeValue(new Date(Date.now() + 5 * 60000)), endsAt: dateTimeValue(new Date(Date.now() + 3 * 86400000)),
});
const tabs: { id: AdminTab; title: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", title: "Overview", icon: LayoutDashboard }, { id: "auctions", title: "Auctions", icon: Tag }, { id: "users", title: "Users", icon: Users },
  { id: "reports", title: "Reports", icon: Flag }, { id: "payments", title: "Payment records", icon: CircleDollarSign }, { id: "audit", title: "Audit log", icon: ClipboardList },
];

export default function Admin() {
  const [, setLocation] = useLocation();
  const { user, loading, isAdmin, isSuspended, logout } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<AdminTab>("overview");
  const [form, setForm] = useState(initialForm);
  const [showCreate, setShowCreate] = useState(false);
  const [reportStatuses, setReportStatuses] = useState<Record<string, ReportRecord["status"]>>({});
  const [reportNotes, setReportNotes] = useState<Record<string, string>>({});
  const [paymentForm, setPaymentForm] = useState({ uid: "", auctionId: "", providerReference: "", status: "pending" as "pending" | "paid" });
  const [saving, setSaving] = useState(false);
  const dashboard = useQuery({ queryKey: ["firestore-admin-dashboard"], queryFn: getAdminDashboardStats, enabled: isAdmin && !isSuspended });
  const auctions = useQuery({ queryKey: ["firestore-admin-auctions"], queryFn: listAdminAuctions, enabled: isAdmin && !isSuspended });
  const users = useQuery({ queryKey: ["firestore-admin-users"], queryFn: listAdminUsers, enabled: isAdmin && !isSuspended });
  const reports = useQuery({ queryKey: ["firestore-admin-reports"], queryFn: listAdminReports, enabled: isAdmin && !isSuspended });
  const payments = useQuery({ queryKey: ["firestore-admin-payments"], queryFn: listAdminPayments, enabled: isAdmin && !isSuspended });
  const audit = useQuery({ queryKey: ["firestore-admin-audit"], queryFn: listAdminAudit, enabled: isAdmin && !isSuspended });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["firestore-admin-dashboard"] }), queryClient.invalidateQueries({ queryKey: ["firestore-admin-auctions"] }),
      queryClient.invalidateQueries({ queryKey: ["firestore-admin-users"] }), queryClient.invalidateQueries({ queryKey: ["firestore-admin-reports"] }),
      queryClient.invalidateQueries({ queryKey: ["firestore-admin-payments"] }), queryClient.invalidateQueries({ queryKey: ["firestore-admin-audit"] }),
      queryClient.invalidateQueries({ queryKey: ["firestore-auctions"] }), queryClient.invalidateQueries({ queryKey: ["firestore-results"] }),
    ]);
  };
  useEffect(() => {
    if (loading) return;
    if (!user) setLocation("/signin");
    else if (!isAdmin) setLocation("/account");
  }, [loading, user, isAdmin, setLocation]);

  const handleSignOut = async () => { await logout(); setLocation("/"); };
  const submitAuction = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || isSuspended) return;
    setSaving(true);
    try {
      await createFirestoreAuction(user.uid, {
        ...form, bidFee: Number(form.bidFee), minBid: Number(form.minBid), maxBid: Number(form.maxBid),
        startsAt: new Date(form.startsAt), endsAt: new Date(form.endsAt), status: "draft",
      });
      toast.success("Auction saved as a draft in Firestore."); setForm(initialForm()); setShowCreate(false); await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not save auction."); }
    finally { setSaving(false); }
  };
  const publishAuction = async (auction: AuctionRecord) => {
    if (!user) return;
    try { await publishFirestoreAuction(user.uid, auction.id); toast.success("Auction published."); await refresh(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not publish auction."); }
  };
  const closeAuction = async (auction: AuctionRecord) => {
    if (!user || !window.confirm(`Close “${auction.title}” and publish its lowest-unique-bid result? This cannot be undone.`)) return;
    try {
      const result = await closeFirestoreAuction(user.uid, auction.id);
      toast.success(result.resultType === "winner" ? `Result published: ${result.referenceCode}` : `No unique bid. Result ${result.referenceCode} published.`);
      await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not finalize auction."); }
  };
  const changeAccountStatus = async (item: UserRecord) => {
    if (!user) return;
    const status = item.status === "active" ? "suspended" : "active";
    if (!window.confirm(`${status === "suspended" ? "Suspend" : "Reactivate"} ${item.email || item.uid}?`)) return;
    try { await updateFirestoreUserStatus(user.uid, item.uid, status); toast.success(`Account ${status === "suspended" ? "suspended" : "reactivated"}.`); await refresh(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Could not update account."); }
  };
  const saveReportReview = async (report: ReportRecord) => {
    if (!user) return;
    try {
      await reviewFirestoreReport(user.uid, report.id, reportStatuses[report.id] ?? report.status, reportNotes[report.id] ?? report.adminNotes);
      toast.success("Report review saved."); await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not update report."); }
  };
  const submitPayment = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !paymentForm.uid || !paymentForm.auctionId || !paymentForm.providerReference.trim()) return;
    if (paymentForm.status === "paid" && !window.confirm("Confirm that you independently verified this payment outside the app? This site does not contact a payment provider.")) return;
    setSaving(true);
    try {
      await createManualPaymentRecord(user.uid, paymentForm);
      toast.success(paymentForm.status === "paid" ? "Verified payment record added. The bidder can now use it once." : "Pending payment record added.");
      setPaymentForm({ uid: "", auctionId: "", providerReference: "", status: "pending" }); await refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not add payment record."); }
    finally { setSaving(false); }
  };

  if (loading || !user || !isAdmin) return <main className="min-h-screen grid place-items-center bg-[#fbf7ed] text-[#173f36]"><div className="text-center"><ShieldCheck className="mx-auto mb-3 h-8 w-8 text-[#0b5f4a]" /><p className="text-sm font-semibold">Verifying administrator access…</p></div></main>;
  if (isSuspended) return <main className="min-h-screen grid place-items-center bg-[#fbf7ed] px-5 text-[#173f36]"><section className="max-w-lg rounded-3xl border border-[#e6dccb] bg-[#fffdf8] p-8 text-center"><ShieldCheck className="mx-auto mb-4 h-10 w-10 text-[#9b3929]" /><h1 className="font-serif text-3xl">Administrator access suspended</h1><p className="mt-3 text-sm leading-6 text-[#737e73]">This account is blocked by Firestore security rules.</p><button onClick={() => void handleSignOut()} className="mt-6 rounded-full bg-[#0b5f4a] px-5 py-2.5 text-sm font-bold text-white">Sign out</button></section></main>;

  const stats = dashboard.data;
  const statCards = [
    { label: "Users", value: stats?.totalUsers, icon: Users }, { label: "Active users", value: stats?.activeUsers, icon: UserRoundCheck }, { label: "Open reports", value: stats?.openReports, icon: Flag },
    { label: "Live auctions", value: stats?.liveAuctions, icon: Tag }, { label: "Completed", value: stats?.completedAuctions, icon: Trophy }, { label: "Bids", value: stats?.totalBids, icon: ClipboardList },
    { label: "Payment records", value: stats?.paymentOrders, icon: CircleDollarSign }, { label: "Winners", value: stats?.winners, icon: Trophy },
  ];
  const error = [dashboard, auctions, users, reports, payments, audit].find((item) => item.isError);

  return (
    <main className="min-h-screen bg-[#f8f6ef] text-[#173f36]">
      <header className="sticky top-0 z-20 flex min-h-20 items-center justify-between border-b border-[#e6dccb] bg-[#fffdf8]/95 px-4 backdrop-blur md:px-10">
        <a href="/" className="font-semibold tracking-tight">Tesaka <span className="font-serif italic text-[#b97828]">Cherta</span><span className="ml-3 rounded-full bg-[#e6f0e3] px-2 py-1 text-[10px] font-bold tracking-wide text-[#0b5f4a]">ADMIN</span></a>
        <div className="flex items-center gap-3"><span className="hidden text-sm text-[#6f756b] sm:inline">{user.email}</span><button onClick={() => void handleSignOut()} className="inline-flex items-center gap-2 rounded-full border border-[#c7d1c7] px-4 py-2 text-sm font-semibold hover:bg-white"><LogOut size={15} /> Sign out</button></div>
      </header>
      <div className="mx-auto grid max-w-7xl gap-7 px-4 py-7 md:grid-cols-[220px_minmax(0,1fr)] md:px-8">
        <aside className="h-fit rounded-2xl border border-[#e6dccb] bg-[#fffdf8] p-3 md:sticky md:top-24"><div className="px-3 py-3"><span className="text-[10px] font-extrabold tracking-[.16em] text-[#a36a29]">CONTROL ROOM</span><h1 className="mt-1 font-serif text-2xl">Admin portal</h1></div><nav className="grid gap-1" aria-label="Admin sections">{tabs.map(({ id, title, icon: Icon }) => <button key={id} onClick={() => setTab(id)} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold ${tab === id ? "bg-[#e8f0e4] text-[#0b5f4a]" : "text-[#707b70] hover:bg-[#f4f1e8]"}`}><Icon size={17} />{title}</button>)}</nav><a href="/" className="mt-4 flex items-center gap-2 border-t border-[#eee6d8] px-3 pt-4 text-sm font-semibold text-[#68766b]"><ArrowLeft size={15} /> Public marketplace</a></aside>
        <section className="min-w-0">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4"><div><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#e4f0e2] px-3 py-1.5 text-[10px] font-extrabold tracking-wide text-[#0b5f4a]"><BadgeCheck size={14} /> FIREBASE ADMIN CLAIM VERIFIED</div><h2 className="font-serif text-4xl tracking-tight">{tabs.find((item) => item.id === tab)?.title}</h2><p className="mt-2 text-sm text-[#737e73]">This portal reads and writes Firestore directly. Security rules enforce access.</p></div><button onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-full border border-[#d7d8c9] bg-white px-4 py-2 text-sm font-bold"><RefreshCw size={14} /> Refresh</button></div>
          {error && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Firestore read failed. Check that the published security rules and Firebase admin custom claim are correct.</div>}
          {tab === "overview" && <><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{statCards.map(({ label, value, icon: StatIcon }) => <article key={label} className="rounded-2xl border border-[#e6dccb] bg-[#fffdf8] p-5"><div className="flex items-center justify-between text-sm font-semibold text-[#737e73]"><span>{label}</span><StatIcon size={18} className="text-[#b97828]" /></div><strong className="mt-3 block font-serif text-4xl">{value ?? "—"}</strong></article>)}</div><div className="mt-5 grid gap-5 xl:grid-cols-2"><section className="rounded-2xl border border-[#e6dccb] bg-[#fffdf8] p-5"><div className="mb-4 flex items-center justify-between"><h3 className="font-serif text-2xl">Auction queue</h3><button onClick={() => setTab("auctions")} className="text-xs font-bold text-[#0b5f4a]">Manage all →</button></div>{auctions.data?.slice(0, 5).map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-t border-[#eee6d8] py-3"><div className="min-w-0"><strong className="block truncate text-sm">{item.title}</strong><span className="text-xs text-[#7b867c]">{item.status} · closes {item.endsAt.toLocaleString()}</span></div><span className="rounded-full bg-[#f1eee5] px-2 py-1 text-[10px] font-bold">{item.bidCount} bids</span></div>)}{!auctions.data?.length && <p className="text-sm text-[#7b867c]">No auctions yet. Create the first one in the Auctions tab.</p>}</section><section className="rounded-2xl border border-[#e6dccb] bg-[#fffdf8] p-5"><div className="mb-4 flex items-center justify-between"><h3 className="font-serif text-2xl">Recent admin events</h3><button onClick={() => setTab("audit")} className="text-xs font-bold text-[#0b5f4a]">Audit history →</button></div>{audit.data?.slice(0, 6).map((item) => <div key={item.id} className="border-t border-[#eee6d8] py-3"><strong className="block text-sm">{item.action}</strong><span className="text-xs text-[#7b867c]">{item.entityType} · {item.createdAt.toLocaleString()}</span></div>)}{!audit.data?.length && <p className="text-sm text-[#7b867c]">Admin events are written to Firestore.</p>}</section></div></>}
          {tab === "auctions" && <><div className="mb-4 flex justify-end"><button onClick={() => setShowCreate(!showCreate)} className="inline-flex items-center gap-2 rounded-full bg-[#0b5f4a] px-4 py-2.5 text-sm font-bold text-white"><Plus size={16} /> {showCreate ? "Close form" : "Create auction"}</button></div>{showCreate && <form onSubmit={(event) => void submitAuction(event)} className="mb-5 grid gap-3 rounded-2xl border border-[#d8dfd1] bg-[#fffdf8] p-5 sm:grid-cols-2 xl:grid-cols-3">
            <label className="grid gap-1 text-xs font-bold">Product / auction title<input required maxLength={220} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2 text-sm font-normal" /></label>
            <label className="grid gap-1 text-xs font-bold">Category<input required value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2 text-sm font-normal" /></label>
            <label className="grid gap-1 text-xs font-bold">Seller display name<input required value={form.sellerName} onChange={(event) => setForm({ ...form, sellerName: event.target.value })} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2 text-sm font-normal" /></label>
            <label className="grid gap-1 text-xs font-bold">Product image URL<input required value={form.imagePath} onChange={(event) => setForm({ ...form, imagePath: event.target.value })} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2 text-sm font-normal" placeholder="https://…" /></label>
            <label className="grid gap-1 text-xs font-bold">Bid service fee (ETB)<input required type="number" min="0.01" step="0.01" value={form.bidFee} onChange={(event) => setForm({ ...form, bidFee: event.target.value })} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2 text-sm font-normal" /></label>
            <label className="grid gap-1 text-xs font-bold">Minimum bid (ETB)<input required type="number" min="0.01" step="0.01" value={form.minBid} onChange={(event) => setForm({ ...form, minBid: event.target.value })} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2 text-sm font-normal" /></label>
            <label className="grid gap-1 text-xs font-bold">Maximum bid (ETB)<input required type="number" min="0.01" step="0.01" value={form.maxBid} onChange={(event) => setForm({ ...form, maxBid: event.target.value })} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2 text-sm font-normal" /></label>
            <label className="grid gap-1 text-xs font-bold">Max bids per user<input required type="number" min={1} max={100} value={form.maxBidsPerUser} onChange={(event) => setForm({ ...form, maxBidsPerUser: Number(event.target.value) })} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2 text-sm font-normal" /></label>
            <label className="grid gap-1 text-xs font-bold">Opens<input required type="datetime-local" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2 text-sm font-normal" /></label>
            <label className="grid gap-1 text-xs font-bold">Closes<input required type="datetime-local" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2 text-sm font-normal" /></label>
            <button disabled={saving} className="self-end rounded-full bg-[#0b5f4a] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{saving ? "Saving…" : "Save draft"}</button>
          </form>}
          <div className="grid gap-3">{auctions.data?.map((item) => <article key={item.id} className="flex flex-wrap items-center gap-4 rounded-2xl border border-[#e6dccb] bg-[#fffdf8] p-4"><img src={item.imagePath} alt="" className="h-16 w-20 rounded-xl object-cover" /><div className="min-w-48 flex-1"><strong>{item.title}</strong><p className="mt-1 text-xs text-[#7b867c]">{item.category} · {item.status} · {item.bidCount} entries · {item.startsAt.toLocaleString()} → {item.endsAt.toLocaleString()}</p></div>{item.status === "draft" && <button onClick={() => void publishAuction(item)} className="rounded-full bg-[#e8f0e4] px-4 py-2 text-xs font-bold text-[#0b5f4a]">Publish</button>}{item.status === "live" && (item.endsAt.getTime() <= Date.now() ? <button onClick={() => void closeAuction(item)} className="rounded-full bg-[#fff1d8] px-4 py-2 text-xs font-bold text-[#8c5b1a]">Close + publish result</button> : <span className="rounded-full bg-[#f1eee5] px-3 py-2 text-xs font-bold text-[#737e73]">Ends {item.endsAt.toLocaleString()}</span>)}{item.status === "closed" && <span className="rounded-full bg-[#f1eee5] px-3 py-2 text-xs font-bold">Closed</span>}</article>)}{!auctions.data?.length && <p className="rounded-2xl bg-white p-6 text-sm text-[#7b867c]">No auctions created yet.</p>}</div></>}
          {tab === "users" && <div className="grid gap-3">{users.data?.map((item) => <article key={item.uid} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e6dccb] bg-[#fffdf8] p-4"><div><strong>{item.name}</strong><p className="text-xs text-[#7b867c]">{item.email ?? item.uid} · {item.role} · joined {item.createdAt.toLocaleDateString()}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${item.status === "active" ? "bg-[#e8f0e4] text-[#0b5f4a]" : "bg-red-100 text-red-800"}`}>{item.status}</span>{item.role !== "admin" && <button onClick={() => void changeAccountStatus(item)} className="inline-flex items-center gap-2 rounded-full border border-[#d7d8c9] px-3 py-2 text-xs font-bold">{item.status === "active" ? <><Ban size={14} /> Suspend</> : <><UserRoundCheck size={14} /> Reactivate</>}</button>}</article>)}{!users.data?.length && <p className="rounded-2xl bg-white p-6 text-sm text-[#7b867c]">No user profiles yet.</p>}</div>}
          {tab === "reports" && <div className="grid gap-4">{reports.data?.map((report) => <article key={report.id} className="rounded-2xl border border-[#e6dccb] bg-[#fffdf8] p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><span className="text-[10px] font-extrabold uppercase tracking-wider text-[#a36a29]">{report.category} · {report.reporterName} · {report.reporterEmail ?? report.uid}</span><h3 className="mt-1 text-lg font-bold">{report.subject}</h3><p className="mt-1 text-xs text-[#7b867c]">{report.createdAt.toLocaleString()}{report.targetId ? ` · ${report.targetType} ${report.targetId}` : ""}</p></div><select value={reportStatuses[report.id] ?? report.status} onChange={(event) => setReportStatuses({ ...reportStatuses, [report.id]: event.target.value as ReportRecord["status"] })} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2 text-sm"><option value="open">Open</option><option value="reviewing">Reviewing</option><option value="resolved">Resolved</option><option value="dismissed">Dismissed</option></select></div><p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-[#596a5f]">{report.details}</p><div className="mt-4 flex flex-wrap gap-2"><input value={reportNotes[report.id] ?? report.adminNotes ?? ""} onChange={(event) => setReportNotes({ ...reportNotes, [report.id]: event.target.value })} maxLength={2000} placeholder="Internal admin note" className="min-w-64 flex-1 rounded-lg border border-[#d7d8c9] bg-white px-3 py-2 text-sm" /><button onClick={() => void saveReportReview(report)} className="rounded-full bg-[#0b5f4a] px-4 py-2 text-xs font-bold text-white">Save review</button></div></article>)}{!reports.data?.length && <p className="rounded-2xl bg-white p-6 text-sm text-[#7b867c]">No reports submitted.</p>}</div>}
          {tab === "payments" && <><div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900"><strong>Manual record only:</strong> this static Firebase app does not charge cards or verify Telebirr transactions. Mark a payment “Verified / paid” only after you independently confirm it with the provider.</div><form onSubmit={(event) => void submitPayment(event)} className="mb-5 grid gap-3 rounded-2xl border border-[#d8dfd1] bg-[#fffdf8] p-5 sm:grid-cols-2"><label className="grid gap-1 text-xs font-bold">Bidder account<select required value={paymentForm.uid} onChange={(event) => setPaymentForm({ ...paymentForm, uid: event.target.value })} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2 text-sm"><option value="">Choose user…</option>{users.data?.map((item) => <option key={item.uid} value={item.uid}>{item.name} · {item.email ?? item.uid}</option>)}</select></label><label className="grid gap-1 text-xs font-bold">Auction<select required value={paymentForm.auctionId} onChange={(event) => setPaymentForm({ ...paymentForm, auctionId: event.target.value })} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2 text-sm"><option value="">Choose auction…</option>{auctions.data?.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.bidFee} ETB</option>)}</select></label><label className="grid gap-1 text-xs font-bold">External provider reference<input required value={paymentForm.providerReference} onChange={(event) => setPaymentForm({ ...paymentForm, providerReference: event.target.value })} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2 text-sm" /></label><label className="grid gap-1 text-xs font-bold">Payment state<select value={paymentForm.status} onChange={(event) => setPaymentForm({ ...paymentForm, status: event.target.value as "pending" | "paid" })} className="rounded-lg border border-[#d7d8c9] bg-white px-3 py-2 text-sm"><option value="pending">Pending</option><option value="paid">Verified / paid</option></select></label><button disabled={saving} className="rounded-full bg-[#0b5f4a] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{saving ? "Saving…" : "Add payment record"}</button></form><div className="grid gap-3">{payments.data?.map((payment) => <article key={`${payment.uid}-${payment.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e6dccb] bg-[#fffdf8] p-4"><div><strong>{payment.auctionTitle} · {payment.amount.toFixed(2)} ETB</strong><p className="mt-1 text-xs text-[#7b867c]">User {payment.uid} · ref {payment.providerReference} · {payment.createdAt.toLocaleString()}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${payment.status === "paid" ? "bg-[#e8f0e4] text-[#0b5f4a]" : payment.status === "failed" ? "bg-red-100 text-red-800" : "bg-[#fff1d8] text-[#8c5b1a]"}`}>{payment.used ? "used" : payment.status}</span></article>)}{!payments.data?.length && <p className="rounded-2xl bg-white p-6 text-sm text-[#7b867c]">No payment records.</p>}</div></>}
          {tab === "audit" && <div className="grid gap-3">{audit.data?.map((item) => <article key={item.id} className="rounded-2xl border border-[#e6dccb] bg-[#fffdf8] p-4"><div className="flex items-center justify-between gap-3"><strong>{item.action}</strong><span className="text-xs text-[#7b867c]">{item.createdAt.toLocaleString()}</span></div><p className="mt-1 text-xs text-[#7b867c]">{item.entityType} · {item.entityId} · by {item.actorUid}</p></article>)}{!audit.data?.length && <p className="rounded-2xl bg-white p-6 text-sm text-[#7b867c]">No audit records.</p>}</div>}
        </section>
      </div>
    </main>
  );
}
