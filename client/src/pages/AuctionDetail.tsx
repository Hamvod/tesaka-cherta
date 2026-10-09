import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { ArrowLeft, CalendarClock, CheckCircle2, Clock3, ShieldCheck, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import { getPublicAuction, listAvailablePayments, listUserPayments, submitFirestoreBid, submitUserReport } from "@/lib/firebaseData";
import PaymentProofForm from "@/components/PaymentProofForm";
import FirestoreImage from "@/components/FirestoreImage";
import { tr, useLanguage } from "@/lib/i18n";

export default function AuctionDetail({ auctionId }: { auctionId: string }) {
  const [, setLocation] = useLocation();
  const { user, isAuthenticated, isSuspended } = useAuth();
  const { language, setLanguage } = useLanguage();
  const queryClient = useQueryClient();
  const auction = useQuery({ queryKey: ["firestore-auction", auctionId], queryFn: () => getPublicAuction(auctionId) });
  const payments = useQuery({ queryKey: ["firestore-payments-available", user?.uid, auctionId], queryFn: () => listAvailablePayments(user!.uid, auctionId), enabled: Boolean(user && auction.data?.bidFee) });
  const paymentHistory = useQuery({ queryKey: ["firestore-user-payments", user?.uid], queryFn: () => listUserPayments(user!.uid), enabled: Boolean(user) });
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportSubject, setReportSubject] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [reporting, setReporting] = useState(false);
  const item = auction.data;
  const now = Date.now();
  const live = item?.status === "live" && item.startsAt.getTime() <= now && item.endsAt.getTime() > now;
  const latestProof = paymentHistory.data?.find((payment) => payment.auctionId === item?.id && payment.source === "bidder_proof");
  const paymentProofPending = latestProof?.status === "pending";
  const t = (key: string, params?: Record<string, string | number>) => tr(key, language, params);

  const placeBid = async () => {
    if (!item) return;
    if (!user) { setLocation("/signin"); return; }
    if (isSuspended) { toast.error(language === "am" ? "መለያዎ ታግዷል።" : "This account is suspended."); return; }
    const parsed = Number(amount);
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || !Number.isFinite(parsed) || parsed < item.minBid || parsed > item.maxBid) {
      toast.error(`${t("auction.range")}: ${item.minBid.toFixed(2)}–${item.maxBid.toFixed(2)} ETB`); return;
    }
    const payment = payments.data?.[0];
    if (item.bidFee > 0 && !payment) { toast.info(t("auction.paymentRequired")); return; }
    setSubmitting(true);
    try {
      await submitFirestoreBid(user.uid, item.id, payment?.id ?? "", parsed.toFixed(2));
      toast.success(t("auction.bidSuccess"));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["firestore-auction", auctionId] }),
        queryClient.invalidateQueries({ queryKey: ["firestore-auctions"] }),
        queryClient.invalidateQueries({ queryKey: ["firestore-account", user.uid] }),
        queryClient.invalidateQueries({ queryKey: ["firestore-payments-available", user.uid] }),
      ]);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not place bid."); }
    finally { setSubmitting(false); }
  };

  const submitReport = async (event: React.FormEvent) => {
    event.preventDefault(); if (!user || !item) return;
    setReporting(true);
    try {
      await submitUserReport(user.uid, { category: "auction", subject: reportSubject, details: reportDetails, targetType: "auction", targetId: item.id });
      setReportSubject(""); setReportDetails(""); setReportOpen(false);
      toast.success(language === "am" ? "ሪፖርቱ ለአስተዳዳሪ ተልኳል።" : "Your report was sent to the administrator.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not send the report."); }
    finally { setReporting(false); }
  };

  return <main className="min-h-screen bg-[#f8f6ef] text-[#173f36]">
    <header className="flex min-h-20 items-center justify-between border-b border-[#e6dccb] bg-[#fffdf8] px-4 md:px-10"><a href="/" className="font-semibold">Tesaka <span className="font-serif italic text-[#b97828]">Cherta</span></a><div className="flex gap-2"><button onClick={() => setLanguage(language === "en" ? "am" : "en")} className="rounded-full border px-3 py-2 text-xs font-bold">{language === "en" ? "አማ" : "EN"}</button><button onClick={() => setLocation("/")} className="inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold"><ArrowLeft size={15} />{t("common.back")}</button></div></header>
    <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
      {auction.isLoading && <p className="rounded-2xl bg-white p-6">{t("common.loading")}</p>}
      {(auction.isError || (!auction.isLoading && !item)) && <section className="rounded-2xl border bg-white p-8"><h1 className="font-serif text-3xl">{language === "am" ? "ጨረታው አልተገኘም" : "Auction not found"}</h1><p className="mt-3 text-sm text-[#737e73]">{language === "am" ? "ጨረታው ተወግዶ ወይም አሁን ለሕዝብ አይታይም።" : "The listing may have been removed or is not public."}</p></section>}
      {item && <div className="grid gap-8 lg:grid-cols-[1.1fr_.9fr]">
        <section className="overflow-hidden rounded-3xl border border-[#e6dccb] bg-white"><FirestoreImage imagePath={item.imagePath} alt={item.title} className="aspect-[4/3] w-full object-cover" eager /><div className="p-6 md:p-8"><div className="flex flex-wrap items-center gap-2"><span className="rounded-full bg-[#e8f0e4] px-3 py-1 text-xs font-bold text-[#0b5f4a]">{item.status === "completed" ? (language === "am" ? "ተጠናቋል" : "COMPLETED") : live ? (language === "am" ? "በቀጥታ" : "LIVE") : (language === "am" ? "የሚመጣ" : "UPCOMING")}</span><span className="text-xs text-[#7b867c]">{item.category} · {item.id.slice(0, 8).toUpperCase()}</span></div><h1 className="mt-4 font-serif text-4xl leading-tight md:text-5xl">{item.title}</h1><p className="mt-3 text-sm text-[#737e73]">{t("auction.seller")}: <strong className="text-[#173f36]">{item.sellerName}</strong></p><div className="my-6 h-px bg-[#eee6d8]" /><h2 className="font-serif text-2xl">{t("auction.description")}</h2><p className="mt-3 whitespace-pre-wrap text-sm leading-7 text-[#596a5f]">{item.description || (language === "am" ? "ለዚህ ምርት መግለጫ የለም።" : "No product description was provided.")}</p><div className="mt-7 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-[#f8f6ef] p-4"><div className="text-xs text-[#7b867c]">{t("auction.fee")}</div><strong className="mt-1 block text-xl">{item.bidFee.toFixed(2)} ETB</strong></div><div className="rounded-xl bg-[#f8f6ef] p-4"><div className="text-xs text-[#7b867c]">{t("auction.range")}</div><strong className="mt-1 block text-xl">{item.minBid.toFixed(2)}–{item.maxBid.toFixed(2)} ETB</strong></div><div className="rounded-xl bg-[#f8f6ef] p-4"><div className="text-xs text-[#7b867c]">{t("auction.start")}</div><strong className="mt-1 flex items-center gap-2 text-sm"><CalendarClock size={15} />{item.startsAt.toLocaleString()}</strong></div><div className="rounded-xl bg-[#f8f6ef] p-4"><div className="text-xs text-[#7b867c]">{t("auction.end")}</div><strong className="mt-1 flex items-center gap-2 text-sm"><Clock3 size={15} />{item.endsAt.toLocaleString()}</strong></div></div></div></section>
        <aside className="grid content-start gap-5"><section className="rounded-3xl border border-[#dce4d7] bg-[#fffdf8] p-6 md:p-8"><div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-[#0b5f4a]"><ShieldCheck size={16} />{t("auction.placeBid")}</div><h2 className="mt-3 font-serif text-3xl">{item.bidCount} <span className="text-xl font-normal">{t("auction.currentCount")}</span></h2>{live ? <><label className="mt-6 grid gap-2 text-sm font-bold">{t("auction.amount")}<input type="number" min={item.minBid} max={item.maxBid} step="0.01" value={amount || item.minBid.toFixed(2)} onChange={(event) => setAmount(event.target.value)} className="rounded-xl border border-[#d7d8c9] bg-white px-4 py-3 text-lg" /></label><p className="mt-2 text-xs text-[#7b867c]">{language === "am" ? `እስከ ${item.maxBidsPerUser} ጨረታዎች። ዝቅተኛው አንድ ጊዜ የቀረበ መጠን ያሸንፋል።` : `Up to ${item.maxBidsPerUser} bids per account. The lowest amount submitted exactly once wins.`}</p>{item.bidFee > 0 && (payments.data?.length ? <div className="mt-4 flex items-center gap-2 rounded-xl bg-[#e8f0e4] p-3 text-xs font-semibold text-[#0b5f4a]"><CheckCircle2 size={15} />{t("auction.paymentReady")}</div> : <div className="mt-4 rounded-xl bg-[#fff1d8] p-3 text-xs leading-5 text-[#775217]">{t("auction.paymentRequired")}</div>)}<button onClick={() => void placeBid()} disabled={submitting || isSuspended || (item.bidFee > 0 && !payments.data?.length)} className="mt-5 w-full rounded-full bg-[#0b5f4a] px-5 py-3 font-bold text-white disabled:opacity-50">{!isAuthenticated ? t("auction.signInBid") : submitting ? (language === "am" ? "በመላክ ላይ…" : "Submitting…") : t("auction.submitBid")}</button></> : <div className="mt-5 rounded-xl bg-[#f1eee5] p-4 text-sm text-[#596a5f]">{t("auction.timeClosed")}</div>}</section>
          {item.bidFee > 0 && ["published", "live"].includes(item.status) && (!user || (payments.isFetched && paymentHistory.isFetched)) && !payments.data?.length && <section className="rounded-2xl border border-[#e6dccb] bg-white p-5">{!user ? <div><strong className="text-sm">{language === "am" ? "የክፍያ ማስረጃ ያስገቡ" : "Submit payment proof"}</strong><p className="mt-1 text-xs text-[#737e73]">{language === "am" ? "TIN አያስፈልግም። ለመቀጠል ይግቡ።" : "No TIN is requested. Sign in to submit a transaction number or receipt."}</p><button onClick={() => setLocation("/signin")} className="mt-3 rounded-full bg-[#0b5f4a] px-4 py-2 text-xs font-bold text-white">{t("auction.signInBid")}</button></div> : paymentProofPending ? <div className="rounded-xl bg-[#fff1d8] p-4 text-sm text-[#775217]"><strong>{language === "am" ? "ማስረጃው በግምገማ ላይ ነው" : "Payment proof is pending review"}</strong><p className="mt-1 text-xs leading-5">{language === "am" ? "ከአስተዳዳሪው የክፍያ አቅራቢ ማረጋገጫ በኋላ መጫረት ይችላሉ።" : "You can bid after the administrator confirms the transfer with the payment provider."}</p></div> : <PaymentProofForm uid={user.uid} auctionId={item.id} auctionTitle={item.title} fee={item.bidFee} onSubmitted={() => { void queryClient.invalidateQueries({ queryKey: ["firestore-user-payments", user.uid] }); void queryClient.invalidateQueries({ queryKey: ["firestore-payments-available", user.uid, auctionId] }); }} />}</section>}
          <section className="rounded-2xl border border-[#e6dccb] bg-white p-5"><div className="flex items-start gap-3"><ShieldCheck className="mt-1 text-[#0b5f4a]" size={18} /><div><strong className="text-sm">{language === "am" ? "ታማኝ ሂደት" : "Trusted process"}</strong><p className="mt-1 text-xs leading-5 text-[#737e73]">{language === "am" ? "ጨረታዎች በአገልጋዩ ይረጋገጣሉ፤ ውጤቶችም በ Cloud Functions ይሰላሉ።" : "Bids are validated server-side; results are calculated and published by Cloud Functions."}</p></div></div></section>
          <button onClick={() => setReportOpen(!reportOpen)} className="rounded-full border border-[#d7d8c9] px-4 py-2.5 text-sm font-bold">{t("auction.report")}</button>
          {reportOpen && <form onSubmit={(event) => void submitReport(event)} className="grid gap-3 rounded-2xl border border-[#e6dccb] bg-white p-5"><h3 className="font-serif text-2xl">{t("auction.reportTitle")}</h3><input required minLength={4} maxLength={160} value={reportSubject} onChange={(e) => setReportSubject(e.target.value)} placeholder={t("auction.reportSubject")} className="rounded-lg border px-3 py-2 text-sm" /><textarea required minLength={20} maxLength={4000} value={reportDetails} onChange={(e) => setReportDetails(e.target.value)} placeholder={t("auction.reportDetails")} rows={4} className="rounded-lg border px-3 py-2 text-sm" /><button disabled={reporting || !user || isSuspended} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b5f4a] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{reporting ? <UploadCloud size={15} className="animate-pulse" /> : null}{t("auction.sendReport")}</button>{!user && <button type="button" onClick={() => setLocation("/signin")} className="text-xs font-bold text-[#0b5f4a]">{t("auction.signInBid")}</button>}</form>}
        </aside>
      </div>}
    </div>
  </main>;
}
