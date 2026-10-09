import { FormEvent, useRef, useState } from "react";
import { FileImage, LoaderCircle, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { submitUserPaymentProof } from "@/lib/firebaseData";
import { compressImageForFirestore } from "@/lib/firestoreImages";
import { extractTransactionNumber, inferReceiptStatusHint, scanPaymentReceipt } from "@/lib/paymentReceiptOcr";
import { useLanguage } from "@/lib/i18n";

type Props = { uid: string; auctionId: string; auctionTitle: string; fee: number; onSubmitted: () => void };

export default function PaymentProofForm({ auctionId, auctionTitle, fee, onSubmitted }: Props) {
  const { language } = useLanguage();
  const [provider, setProvider] = useState("Telebirr");
  const [providerReference, setProviderReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [proofImageDataUrl, setProofImageDataUrl] = useState<string | null>(null);
  const [preparingImage, setPreparingImage] = useState(false);
  const [ocrText, setOcrText] = useState("");
  const [ocrState, setOcrState] = useState<"idle" | "scanning" | "done" | "failed">("idle");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const fileSelectionId = useRef(0);
  const am = language === "am";
  const inputClass = "rounded-lg border border-[#d7d8c9] bg-white px-3 py-2.5 text-sm font-normal text-[#173f36]";

  const chooseFile = (next: File | null) => {
    const selectionId = ++fileSelectionId.current;
    setFile(next); setProofImageDataUrl(null); setOcrText(""); setOcrProgress(0);
    if (!next) { setOcrState("idle"); setPreparingImage(false); return; }
    setOcrState("scanning");
    setPreparingImage(true);
    void compressImageForFirestore(next).then((dataUrl) => {
      if (selectionId === fileSelectionId.current) setProofImageDataUrl(dataUrl);
    }).catch((error: unknown) => {
      if (selectionId === fileSelectionId.current) {
        fileSelectionId.current += 1;
        setFile(null); setProofImageDataUrl(null);
        setPreparingImage(false); setOcrState("failed");
        toast.error(error instanceof Error ? error.message : (am ? "ምስሉን ማዘጋጀት አልተቻለም።" : "Could not prepare the receipt image."));
      }
    }).finally(() => { if (selectionId === fileSelectionId.current) setPreparingImage(false); });
    void scanPaymentReceipt(next, setOcrProgress, language).then((recognized) => {
      if (selectionId !== fileSelectionId.current) return;
      setOcrText(recognized);
      const candidate = extractTransactionNumber(recognized);
      if (candidate) setProviderReference((old) => old || candidate);
      setOcrState("done");
    }).catch((error: unknown) => {
      if (selectionId !== fileSelectionId.current) return;
      console.warn("[Payment proof] Browser OCR failed", error);
      setOcrState("failed");
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!providerReference.trim() && !file) {
      toast.error(am ? "የግብይት ቁጥር ያስገቡ ወይም ደረሰኝ ይጫኑ።" : "Enter a transaction number or upload a receipt image.");
      return;
    }
    if (file && (preparingImage || !proofImageDataUrl)) {
      toast.info(am ? "የደረሰኙ ምስል እስኪዘጋጅ ይጠብቁ።" : "Wait for the receipt image to finish preparing.");
      return;
    }
    setSubmitting(true);
    try {
      await submitUserPaymentProof({
        auctionId, provider: provider.trim(),
        ...(providerReference.trim() ? { providerReference: providerReference.trim() } : {}),
        ...(proofImageDataUrl ? { proofImageDataUrl } : {}),
        ...(ocrText ? { ocrText } : {}),
      });
      toast.success(am ? "የክፍያ ማስረጃ ተልኳል። ከአስተዳዳሪ ማረጋገጫ በኋላ መጫረት ይችላሉ።" : "Payment proof submitted. Bidding is enabled after administrator verification.");
      fileSelectionId.current += 1;
      setProviderReference(""); setFile(null); setProofImageDataUrl(null); setOcrText(""); setOcrState("idle"); onSubmitted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (am ? "ማስረጃውን መላክ አልተቻለም።" : "Could not submit payment proof."));
    } finally { setSubmitting(false); }
  };

  const hint = ocrText ? inferReceiptStatusHint(ocrText) : "unclear";
  return <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3 rounded-xl border border-[#e6dccb] bg-white p-4">
    <div><strong className="text-sm">{am ? "የክፍያ ማስረጃ ያስገቡ" : "Submit payment proof"}</strong><p className="mt-1 text-xs leading-5 text-[#737e73]">{am ? `${auctionTitle} · ${fee.toFixed(2)} ETB። TIN አያስፈልግም።` : `${auctionTitle} · ${fee.toFixed(2)} ETB. No TIN is requested.`}</p></div>
    <label className="grid gap-1 text-xs font-bold">{am ? "የክፍያ አቅራቢ" : "Payment provider"}<select value={provider} onChange={(event) => setProvider(event.target.value)} className={inputClass}><option>Telebirr</option><option>CBE Birr</option><option>Awash</option><option>{am ? "ሌላ" : "Other"}</option></select></label>
    <label className="grid gap-1 text-xs font-bold">{am ? "የግብይት / ማጣቀሻ ቁጥር (አማራጭ)" : "Transaction / reference number (optional)"}<input maxLength={160} value={providerReference} onChange={(event) => setProviderReference(event.target.value)} className={inputClass} placeholder="e.g. FT…" /></label>
    <label className="grid gap-1 text-xs font-bold"><span className="inline-flex items-center gap-2"><FileImage size={14}/>{am ? "የደረሰኝ ስክሪንሾት (አማራጭ)" : "Receipt screenshot (optional)"}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} className={inputClass}/><span className="text-[11px] font-normal text-[#7b867c]">{am ? "JPEG/PNG/WebP፣ እስከ 12 MB። OCR በአሳሽዎ ውስጥ ይሰራል፤ ምስሉ ተጨምቆ በFirestore በግል ይቀመጣል (ከ300 KB በታች)።" : "JPEG/PNG/WebP up to 12 MB. OCR runs in your browser; the image is compressed and stored privately in Firestore under 300 KB."}</span></label>
    {file && <div className="rounded-lg bg-[#f8f6ef] p-3 text-xs"><strong>{file.name}</strong>{preparingImage && <span className="ml-2 text-[#0b5f4a]">{am ? "ምስል በማዘጋጀት ላይ…" : "Preparing image for Firestore…"}</span>}{ocrState === "scanning" && <span className="ml-2 text-[#0b5f4a]">{am ? "ማንበብ ላይ" : "Reading"}… {ocrProgress}%</span>}{ocrState === "done" && <div className="mt-1 text-[#596a5f]">{am ? "OCR ጥቆማ" : "OCR hint"}: {hint === "success_terms" ? (am ? "የስኬት ቃላት ተገኝተዋል" : "success-like words found") : hint === "failure_terms" ? (am ? "የአለመሳካት ቃላት ተገኝተዋል" : "failure-like words found") : (am ? "የሁኔታ ቃል አልተለየም" : "no clear status words found")}. {am ? "ይህ ክፍያን አያረጋግጥም።" : "This does not verify payment."}</div>}{ocrState === "failed" && <p className="mt-1 text-[#8c5b1a]">{am ? "OCR አልተሳካም፤ የግብይት ቁጥሩን እራስዎ ያስገቡ።" : "OCR could not read the image; enter the transaction number manually."}</p>}</div>}
    <p className="rounded-lg bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">{am ? "OCR ጽሑፍን ብቻ ያነባል፤ የባንክ/የክፍያ አቅራቢ መዝገብ አያረጋግጥም። ደረሰኙ በግል በFirestore ይቀመጣል፤ አስተዳዳሪው ከአቅራቢው በተለይ ካረጋገጠ በኋላ ብቻ ይጸድቃል።" : "OCR reads text only; it cannot check a bank/provider ledger or prove settlement. Your receipt is private in Firestore. An administrator must independently confirm the transaction with the provider before marking it paid."}</p>
    <button disabled={submitting || preparingImage} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b5f4a] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{submitting ? <><LoaderCircle size={14} className="animate-spin"/>{am ? "ማስረጃ በመላክ ላይ…" : "Submitting proof…"}</> : <><UploadCloud size={14}/>{am ? "ለማረጋገጫ ላክ" : "Submit for verification"}</>}</button>
  </form>;
}
