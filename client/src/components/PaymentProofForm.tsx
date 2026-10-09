import { FormEvent, useRef, useState } from "react";
import { FileImage, LoaderCircle, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { submitUserPaymentProof } from "@/lib/firebaseData";
import { compressImageForFirestore } from "@/lib/firestoreImages";
import { useLanguage } from "@/lib/i18n";

type Props = { uid: string; auctionId: string; auctionTitle: string; fee: number; onSubmitted: () => void };

export default function PaymentProofForm({ auctionId, auctionTitle, fee, onSubmitted }: Props) {
  const { language } = useLanguage();
  const [provider, setProvider] = useState("Telebirr");
  const [providerReference, setProviderReference] = useState("");
  const [proofImageDataUrl, setProofImageDataUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [preparingImage, setPreparingImage] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileSelectionId = useRef(0);
  const am = language === "am";
  const inputClass = "rounded-lg border border-[#d7d8c9] bg-white px-3 py-2.5 text-sm font-normal text-[#173f36]";
  const paymentAccount = provider === "Telebirr" ? "0983019516" : "1000766215908";

  const chooseFile = (file: File | null) => {
    const selectionId = ++fileSelectionId.current;
    setProofImageDataUrl(null);
    setFileName(file?.name ?? "");
    if (!file) { setPreparingImage(false); return; }
    setPreparingImage(true);
    void compressImageForFirestore(file)
      .then((dataUrl) => { if (selectionId === fileSelectionId.current) setProofImageDataUrl(dataUrl); })
      .catch((error: unknown) => {
        if (selectionId !== fileSelectionId.current) return;
        setFileName("");
        toast.error(error instanceof Error ? error.message : (am ? "ምስሉን ማዘጋጀት አልተቻለም።" : "Could not prepare the receipt image."));
      })
      .finally(() => { if (selectionId === fileSelectionId.current) setPreparingImage(false); });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!providerReference.trim() && !proofImageDataUrl) {
      toast.error(am ? "የግብይት ቁጥር ያስገቡ ወይም ደረሰኝ ይጫኑ።" : "Enter a transaction number or attach a receipt.");
      return;
    }
    if (preparingImage) {
      toast.info(am ? "የደረሰኙ ምስል እስኪዘጋጅ ይጠብቁ።" : "Wait for the receipt image to finish preparing.");
      return;
    }
    setSubmitting(true);
    try {
      await submitUserPaymentProof({
        auctionId,
        provider,
        ...(providerReference.trim() ? { providerReference: providerReference.trim() } : {}),
        ...(proofImageDataUrl ? { proofImageDataUrl } : {}),
      });
      toast.success(am ? "የክፍያ ማስረጃ ተልኳል። ከአስተዳዳሪ ማረጋገጫ በኋላ መጫረት ይችላሉ።" : "Payment proof submitted. Bidding is enabled after administrator verification.");
      fileSelectionId.current += 1;
      setProviderReference("");
      setFileName("");
      setProofImageDataUrl(null);
      onSubmitted();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (am ? "ማስረጃውን መላክ አልተቻለም።" : "Could not submit payment proof."));
    } finally { setSubmitting(false); }
  };

  return <form onSubmit={(event) => void submit(event)} className="mt-4 grid gap-3 rounded-xl border border-[#e6dccb] bg-white p-4">
    <div>
      <strong className="text-sm">{am ? "የክፍያ ማስረጃ ያስገቡ" : "Submit payment proof"}</strong>
      <p className="mt-1 text-xs text-[#737e73]">{auctionTitle} · {fee.toFixed(2)} ETB</p>
    </div>
    <label className="grid gap-1 text-xs font-bold">{am ? "የክፍያ አቅራቢ" : "Payment provider"}
      <select value={provider} onChange={(event) => setProvider(event.target.value)} className={inputClass}>
        <option>Telebirr</option><option>CBE Birr</option>
      </select>
    </label>
    <div className="flex items-center justify-between gap-3 rounded-lg bg-[#f5f8f1] p-3 text-xs">
      <span>{provider === "Telebirr" ? (am ? "የTelebirr ስልክ ቁጥር" : "Telebirr number") : (am ? "የCBE Birr አካውንት" : "CBE Birr account")}</span>
      <strong className="select-all text-base">{paymentAccount}</strong>
    </div>
    <label className="grid gap-1 text-xs font-bold">{am ? "የግብይት ቁጥር (አማራጭ፣ ደረሰኝ ካለ)" : "Transaction reference (optional if you attach a receipt)"}
      <input maxLength={160} value={providerReference} onChange={(event) => setProviderReference(event.target.value)} className={inputClass} placeholder="e.g. FT-123456" />
    </label>
    <label className="grid gap-1 text-xs font-bold">
      <span className="inline-flex items-center gap-2"><FileImage size={14}/>{am ? "ደረሰኝ (አማራጭ)" : "Receipt image (optional)"}</span>
      <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} className={inputClass}/>
      <span className="text-[11px] font-normal text-[#7b867c]">{am ? "JPEG/PNG/WebP፣ እስከ 12 MB። በአሳሽ ይጨመቃል እና በFirestore በግል ይቀመጣል።" : "JPEG, PNG, or WebP up to 12 MB. Compressed in your browser and stored privately in Firestore."}</span>
    </label>
    {fileName && <div className="text-xs text-[#596a5f]">{fileName}{preparingImage && <span className="ml-2">{am ? "በማዘጋጀት ላይ…" : "Preparing…"}</span>}{proofImageDataUrl && <span className="ml-2 text-[#0b5f4a]">{am ? "ዝግጁ" : "Ready"}</span>}</div>}
    <p className="rounded-lg bg-amber-50 p-3 text-[11px] leading-5 text-amber-900">{am ? "ክፍያው በአስተዳዳሪ ከተረጋገጠ በኋላ ብቻ ይፈቀዳል።" : "Your payment is reviewed by an administrator before bidding is enabled."}</p>
    <button disabled={submitting || preparingImage} className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0b5f4a] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
      {submitting ? <><LoaderCircle size={14} className="animate-spin"/>{am ? "በመላክ ላይ…" : "Submitting…"}</> : <><UploadCloud size={14}/>{am ? "ለማረጋገጫ ላክ" : "Submit for verification"}</>}
    </button>
  </form>;
}
