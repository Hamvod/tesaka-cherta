import { FormEvent, useState } from "react";
import { FileImage, LoaderCircle, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { submitUserPaymentProof } from "@/lib/firebaseData";
import { uploadPaymentReceipt } from "@/lib/cloudFunctions";
import { extractTransactionNumber, inferReceiptStatusHint, scanPaymentReceipt } from "@/lib/paymentReceiptOcr";
import { useLanguage } from "@/lib/i18n";

type Props = { uid: string; auctionId: string; auctionTitle: string; fee: number; onSubmitted: () => void };

export default function PaymentProofForm({ uid, auctionId, auctionTitle, fee, onSubmitted }: Props) {
  const { language } = useLanguage();
  const [provider, setProvider] = useState("Telebirr");
  const [providerReference, setProviderReference] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [ocrText, setOcrText] = useState("");
  const [ocrState, setOcrState] = useState<"idle" | "scanning" | "done" | "failed">("idle");
  const [ocrProgress, setOcrProgress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const am = language === "am";
  const inputClass = "rounded-lg border border-[#d7d8c9] bg-white px-3 py-2.5 text-sm font-normal text-[#173f36]";

  const chooseFile = (next: File | null) => {
    setFile(next); setOcrText(""); setOcrProgress(0);
    if (!next) { setOcrState("idle"); return; }
    if (!(["image/jpeg", "image/png", "image/webp"].includes(next.type)) || next.size > 5 * 1024 * 1024) {
      toast.error(am ? "JPEG፣ PNG ወይም WebP ምስል እስከ 5 MB ይምረጡ።" : "Choose a JPEG, PNG, or WebP image no larger than 5 MB.");
      setFile(null); setOcrState("failed"); return;
    }
    setOcrState("scanning");
    void scanPaymentReceipt(next, setOcrProgress, language).then((recognized) => {
      setOcrText(recognized);
      const candidate = extractTransactionNumber(recognized);
      if (candidate) setProviderReference((old) => old || candidate);
      setOcrState("done");
    }).catch((error: unknown) => {
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
    setSubmitting(true);
    try {
      let proofStoragePath: string | undefined;
      if (file) {
        setUploadProgress(0);
        const uploaded = await uploadPaymentReceipt(uid, file, setUploadProgress);
        proofStoragePath = uploaded.proofStoragePath;
      }
      await submitUserPaymentProof({
        auctionId, provider: provider.trim(),
        ...(providerReference.trim() ? { providerReference: providerReference.trim() } : {}),
        ...(proofStoragePath ? { proofStoragePath } : {}),
        ...(ocrText ? { ocrText } : {}),
      });
      toast.success(am ? "የክፍያ ማስረጃ ተልኳል። ከአስተዳዳሪ ማረጋገጫ በኋላ መጫረት ይችላሉ።" : "Payment proof submitted. Bidding is enabled after administrator verification.");
      setProviderReference(""); setFile(null); setOcrText(""); setOcrState("idle"); setUploadProgress(null); onSubmitted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (am ? "ማስረጃውን መላክ አልተቻለም።" : "Could not submit payment proof."));
    } finally { setSubmitting(false); }
  };

  const hint = ocrText ? inferReceiptStatusHint(ocrText) : "unclear";
  return <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3 rounded-xl border border-[#e6dccb] bg-white p-4">
    <div><strong className="text-sm">{am ? "የክፍያ ማስረጃ ያስገቡ" : "Submit payment proof"}</strong><p className="mt-1 text-xs leading-5 text-[#737e73]">{am ? `${auctionTitle} · ${fee.toFixed(2)} ETB። TIN አያስፈልግም።` : `${auctionTitle} · ${fee.toFixed(2)} ETB. No TIN is requested.`}</p></div>
    <label className="grid gap-1 text-xs font-bold">{am ? "የክፍያ አቅራቢ" : "Payment provider"}<select value={provider} onChange={(event) => setProvider(event.target.value)} className={inputClass}><option>Telebirr</option><option>CBE Birr</option><option>Awash</option><option>{am ? "ሌላ" : "Other"}</option></select></label>
    <label className="grid gap-1 text-xs font-bold">{am ? "የግብይት / ማጣቀሻ ቁጥር (አማራጭ)" : "Transaction / reference number (optional)"}<input maxLength={160} value={providerReference} onChange={(event) => setProviderReference(event.target.value)} className={inputClass} placeholder="e.g. FT…" /></label>
    <label className="grid gap-1 text-xs font-bold"><span className="inline-flex items-center gap-2"><FileImage size={14}/>{am ? "የደረሰኝ ስክሪንሾት (አማራጭ)" : "Receipt screenshot (optional)"}</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} className={inputClass}/><span className="text-[11px] font-normal text-[#7b867c]">{am ? "JPEG/PNG/WebP፣ እስከ 5 MB። OCR በአሳሽዎ ውስጥ ይሰራል።" : "JPEG/PNG/WebP, up to 5 MB. OCR runs in your browser."}</span></label>
    {file && <div className="rounded-lg bg-[#f8f6ef] p-3 text-xs"><strong>{file.name}</strong>{ocrState === "scanning" && <span className="ml-2 text-[#0b5f4a]">{am ? "ማንበብ ላይ" : "Reading"}… {ocrProgress}%</span>}{ocrState === "done" && <div className="mt-1 text-[#596a5f]">{am ? "OCR ጥቆማ" : "OCR hint"}: {hint === "success_terms" ? (am ? "የስኬት ቃላት ተገኝተዋል" : "success-like words found") : hint === "failure_terms" ? (am ? "የአለመሳካት ቃላት ተገኝተዋል" : "failure-like words found") : (am ? "የሁኔታ ቃል አልተለየም" : "no clear status words found")}. {am ? "ይህ ክፍያን አያረጋግጥም።" : "This does not verify payment."}</div>}{ocrState === "failed" && <p className="mt-1 text-[#8c5b1a]">{am ? "OCR አልተሳካም፤ የግብይት ቁጥሩን እራስዎ ያስገቡ።" : "OCR could not read the image; enter the transaction number manually."}</p>}</div>}
    {uploadProgress !== null && <div className="text-xs text-[#0b5f4a]">{am ? "በመጫን ላይ" : "Uploading"} {uploadProgress}%</div>}
    <p className="rounded-lg bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">{am ? "OCR ጽሑፍን ብቻ ያነባል፤ የባንክ/የክፍያ አቅራቢ መዝገብ አያረጋግጥም። ደረሰኙ በግል ይቀመጣል፤ አስተዳዳሪው ከአቅራቢው በተለይ ካረጋገጠ በኋላ ብቻ ይጸድቃል።" : "OCR reads text only; it cannot check a bank/provider ledger or prove settlement. Your receipt is private. An administrator must independently confirm the transaction with the provider before marking it paid."}</p>
    <button disabled={submitting || ocrState === "scanning"} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b5f4a] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">{submitting ? <><LoaderCircle size={14} className="animate-spin"/>{am ? "ማስረጃ በመላክ ላይ…" : "Submitting proof…"}</> : <><UploadCloud size={14}/>{am ? "ለማረጋገጫ ላክ" : "Submit for verification"}</>}</button>
  </form>;
}
