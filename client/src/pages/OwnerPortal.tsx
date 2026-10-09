import { FormEvent, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, BadgeCheck, LogOut, Pencil, RefreshCw, ShieldCheck, Tag, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import AuctionForm from "@/components/AuctionForm";
import FirestoreImage from "@/components/FirestoreImage";
import { useAuth } from "@/_core/hooks/useAuth";
import { auth } from "@/lib/firebase";
import { closeAuctionForEditing, closeFirestoreAuction, deleteFirestoreAuction, getOwnerApplication, listOwnerAuctions, requestOwnerApplication, submitAuctionReview, type AuctionRecord } from "@/lib/firebaseData";
import { tr, useLanguage } from "@/lib/i18n";

export default function OwnerPortal() {
  const [, setLocation] = useLocation();
  const { user, loading, isAdmin, isOwner, isSuspended, logout } = useAuth();
  const { language, setLanguage } = useLanguage();
  const queryClient = useQueryClient();
  const [application, setApplication] = useState({ businessName: "", city: "", contactPhone: "", description: "" });
  const [submitting, setSubmitting] = useState(false);
  const [editingAuctionId, setEditingAuctionId] = useState<string | null>(null);
  const [deletingAuctionId, setDeletingAuctionId] = useState<string | null>(null);
  const appQuery = useQuery({ queryKey: ["owner-application", user?.uid], queryFn: () => getOwnerApplication(user!.uid), enabled: Boolean(user && !isOwner) });
  const auctions = useQuery({ queryKey: ["owner-auctions", user?.uid], queryFn: () => listOwnerAuctions(user!.uid), enabled: Boolean(user && isOwner && !isSuspended) });
  const t = (key: string) => tr(key, language);

  useEffect(() => { if (!loading && !user) setLocation("/signin"); else if (isAdmin) setLocation("/admin"); }, [loading, user, isAdmin, setLocation]);
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["owner-auctions", user?.uid] }),
      queryClient.invalidateQueries({ queryKey: ["owner-application", user?.uid] }),
    ]);
  };
  const apply = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || isSuspended) return;
    setSubmitting(true);
    try { await requestOwnerApplication(application); toast.success(t("owner.applied")); await refresh(); }
    catch (error) { toast.error(error instanceof Error ? error.message : (language === "am" ? "ማመልከቻውን መላክ አልተቻለም።" : "Could not submit owner application.")); }
    finally { setSubmitting(false); }
  };
  const signOut = async () => { await logout(); setLocation("/"); };
  const refreshClaims = async () => { await auth.currentUser?.getIdToken(true); window.location.reload(); };
  const editListing = async (item: AuctionRecord) => {
    try {
      if (["published", "live"].includes(item.status)) {
        await closeAuctionForEditing(user!.uid, item.id);
        toast.success(language === "am" ? "ጨረታው ተዘግቷል፤ አሁን ማስተካከል ይችላሉ።" : "Auction closed. You can now edit it as a draft.");
        await refresh();
      }
      setEditingAuctionId(item.id);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open this auction for editing.");
    }
  };
  const deleteListing = async (item: AuctionRecord) => {
    const confirmed = window.confirm(language === "am"
      ? `“${item.title}” ለዘላለም መሰረዝ ይፈልጋሉ? ይህ አይመለስም።`
      : `Permanently delete “${item.title}”? This cannot be undone.`);
    if (!confirmed) return;
    setDeletingAuctionId(item.id);
    try {
      await deleteFirestoreAuction(user!.uid, item.id);
      if (editingAuctionId === item.id) setEditingAuctionId(null);
      toast.success(language === "am" ? "ጨረታው ተሰርዟል።" : "Auction deleted.");
      await refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete this auction.");
    } finally { setDeletingAuctionId(null); }
  };

  if (loading || !user) return <main className="grid min-h-screen place-items-center bg-[#f8f6ef]">{t("common.loading")}</main>;
  if (isSuspended) return <main className="grid min-h-screen place-items-center bg-[#f8f6ef] p-5"><section className="max-w-xl rounded-2xl bg-white p-8 text-center"><ShieldCheck className="mx-auto text-red-700"/><h1 className="mt-3 font-serif text-3xl">{language === "am" ? "መለያው ታግዷል" : "Account suspended"}</h1><button onClick={() => void signOut()} className="mt-5 rounded-full bg-[#0b5f4a] px-5 py-2 text-white">{t("common.signOut")}</button></section></main>;
  const applicationStatus = appQuery.data?.status ?? "none";
  const approvedButClaimMissing = applicationStatus === "approved" && !isOwner;
  return <main className="min-h-screen bg-[#f8f6ef] text-[#173f36]">
    <header className="flex min-h-20 items-center justify-between border-b border-[#e6dccb] bg-[#fffdf8] px-4 md:px-10">
      <a href="/" className="font-semibold">Tesaka <span className="font-serif italic text-[#b97828]">Cherta</span></a>
      <div className="flex items-center gap-2"><button onClick={() => setLanguage(language === "en" ? "am" : "en")} className="rounded-full border px-3 py-2 text-xs font-bold">{language === "en" ? "አማ" : "EN"}</button><a href="/account" className="rounded-full border px-3 py-2 text-xs font-semibold">{t("nav.account")}</a><button onClick={() => void signOut()} className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold"><LogOut size={14}/>{t("common.signOut")}</button></div>
    </header>
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
      <a href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0b5f4a]"><ArrowLeft size={15}/>{t("common.back")}</a>
      <div className="mt-5 flex flex-wrap items-end justify-between gap-4"><div><div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[#e4f0e2] px-3 py-1.5 text-[10px] font-extrabold tracking-wide text-[#0b5f4a]"><BadgeCheck size={14}/>{isOwner ? t("owner.approved") : t("owner.title")}</div><h1 className="font-serif text-5xl">{t("owner.title")}</h1><p className="mt-2 max-w-2xl text-sm text-[#737e73]">{t("owner.subtitle")}</p></div><button onClick={() => void refresh()} className="inline-flex items-center gap-2 rounded-full border bg-white px-4 py-2 text-sm font-bold"><RefreshCw size={14}/>{t("common.refresh")}</button></div>
      {!isOwner && !approvedButClaimMissing && <section className="mt-7 grid gap-6 rounded-3xl border border-[#e6dccb] bg-[#fffdf8] p-6 md:grid-cols-[.8fr_1.2fr] md:p-8"><div><h2 className="font-serif text-3xl">{t("owner.applyTitle")}</h2><p className="mt-3 text-sm leading-6 text-[#737e73]">{t("owner.applyBody")}</p><div className="mt-4 rounded-xl bg-[#f2efe6] p-4 text-xs text-[#596a5f]">{applicationStatus === "pending" ? t("owner.pending") : applicationStatus === "rejected" ? t("owner.rejected") : (language === "am" ? "የአስተዳዳሪ ማጽደቅ ያስፈልጋል።" : "Administrator approval is required before seller features are unlocked.")}</div></div><form onSubmit={(event) => void apply(event)} className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1 text-xs font-bold">{t("owner.business")}<input required minLength={2} maxLength={120} value={application.businessName} onChange={(e) => setApplication({ ...application, businessName: e.target.value })} className="rounded-lg border bg-white px-3 py-2.5 text-sm font-normal"/></label><label className="grid gap-1 text-xs font-bold">{t("owner.city")}<input required minLength={2} maxLength={100} value={application.city} onChange={(e) => setApplication({ ...application, city: e.target.value })} className="rounded-lg border bg-white px-3 py-2.5 text-sm font-normal"/></label><label className="grid gap-1 text-xs font-bold sm:col-span-2">{t("owner.phone")}<input required minLength={7} maxLength={40} value={application.contactPhone} onChange={(e) => setApplication({ ...application, contactPhone: e.target.value })} className="rounded-lg border bg-white px-3 py-2.5 text-sm font-normal"/></label><label className="grid gap-1 text-xs font-bold sm:col-span-2">{t("owner.description")}<textarea required minLength={20} maxLength={2000} rows={4} value={application.description} onChange={(e) => setApplication({ ...application, description: e.target.value })} className="rounded-lg border bg-white px-3 py-2.5 text-sm font-normal"/></label><button disabled={submitting || applicationStatus === "pending"} className="rounded-full bg-[#0b5f4a] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50">{submitting ? t("common.loading") : t("owner.apply")}</button></form></section>}
      {approvedButClaimMissing && <section className="mt-7 rounded-2xl border border-amber-200 bg-amber-50 p-6"><h2 className="font-serif text-2xl">{language === "am" ? "ማመልከቻዎ ተፈቅዷል" : "Your application is approved"}</h2><p className="mt-2 text-sm">{language === "am" ? "የሻጭ መዳረሻዎን ለማዘመን የፋየርቤዝ መለያዎን ያድሱ።" : "Refresh your Firebase access token to activate the owner claim."}</p><button onClick={() => void refreshClaims()} className="mt-4 rounded-full bg-[#0b5f4a] px-5 py-2.5 text-sm font-bold text-white">{language === "am" ? "መዳረሻን አድስ" : "Refresh seller access"}</button></section>}
      {isOwner && <>
        <div className="mt-6 rounded-xl border border-[#cddcc8] bg-[#e8f0e4] p-4 text-sm text-[#0b5f4a]"><strong>{t("owner.reviewHint")}</strong></div>
        <section className="mt-6"><h2 className="mb-4 font-serif text-3xl">{t("owner.newAuction")}</h2><AuctionForm actorUid={user.uid} sellerDefault={user.name} mode="review" onCreated={() => void refresh()}/></section>
        <section className="mt-8"><div className="mb-4 flex items-center justify-between"><h2 className="font-serif text-3xl">{t("owner.myListings")}</h2><span className="rounded-full bg-white px-3 py-1 text-xs font-bold">{auctions.data?.length ?? 0}</span></div>
          <div className="grid gap-3">{auctions.data?.map((item) => {
            const canEdit = item.bidCount === 0 && ["draft", "rejected", "closed", "published", "live"].includes(item.status) && !(item.status === "live" && item.endsAt.getTime() <= Date.now());
            const canDelete = item.bidCount === 0 && ["draft", "rejected", "closed", "published", "live"].includes(item.status);
            return <article key={item.id} className="rounded-2xl border border-[#e6dccb] bg-[#fffdf8] p-4">
              <div className="flex flex-wrap items-center gap-4"><FirestoreImage imagePath={item.imagePath} alt="" className="h-16 w-20 rounded-xl object-cover"/><div className="min-w-48 flex-1"><strong>{item.title}</strong><p className="mt-1 text-xs text-[#7b867c]">{item.category} · {item.bidCount} {language === "am" ? "ጨረታዎች" : "bids"} · {item.startsAt.toLocaleString()} – {item.endsAt.toLocaleString()}</p></div><span className="rounded-full bg-[#f1eee5] px-3 py-1.5 text-xs font-bold">{item.status.replace("_", " ")}</span>
                {canEdit && <button onClick={() => void editListing(item)} className="inline-flex items-center gap-2 rounded-full bg-[#e8f0e4] px-4 py-2 text-xs font-bold text-[#0b5f4a]"><Pencil size={13}/>{language === "am" ? "ማስተካከል" : "Edit"}</button>}
                {canDelete && <button disabled={deletingAuctionId === item.id} onClick={() => void deleteListing(item)} className="inline-flex items-center gap-2 rounded-full bg-red-50 px-4 py-2 text-xs font-bold text-red-700 disabled:opacity-50"><Trash2 size={13}/>{deletingAuctionId === item.id ? t("common.loading") : language === "am" ? "ሰርዝ" : "Delete"}</button>}
                {["draft", "rejected"].includes(item.status) && <button onClick={async () => { try { await submitAuctionReview(user.uid, item.id); toast.success(t("owner.pending")); await refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not submit listing."); } }} className="rounded-full bg-[#e8f0e4] px-4 py-2 text-xs font-bold text-[#0b5f4a]">{t("owner.submitReview")}</button>}
                {item.status === "live" && item.endsAt.getTime() <= Date.now() && <button onClick={async () => { try { await closeFirestoreAuction(user.uid, item.id); toast.success(language === "am" ? "ውጤቱ ታትሟል።" : "Auction result published."); await refresh(); } catch (error) { toast.error(error instanceof Error ? error.message : "Could not finalize."); } }} className="rounded-full bg-[#fff1d8] px-4 py-2 text-xs font-bold">{language === "am" ? "ውጤት አትም" : "Publish result"}</button>}
              </div>
              {editingAuctionId === item.id && <div className="mt-4 border-t border-[#e6dccb] pt-4"><div className="mb-3 flex items-center justify-between"><h3 className="font-bold">{language === "am" ? "ዝርዝርን አስተካክል" : "Edit listing"}</h3><button onClick={() => setEditingAuctionId(null)} className="inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-bold"><X size={13}/>{language === "am" ? "ዝጋ" : "Cancel"}</button></div><AuctionForm key={item.id} actorUid={user.uid} sellerDefault={user.name} auction={item} onCreated={() => { setEditingAuctionId(null); void refresh(); }}/></div>}
            </article>;
          })}{!auctions.data?.length && <p className="rounded-2xl bg-white p-6 text-sm text-[#7b867c]"><Tag className="mb-2"/>{t("owner.empty")}</p>}</div>
        </section>
      </>}
    </div>
  </main>;
}
