import { FormEvent, useRef, useState } from "react";
import { ImagePlus, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { createFirestoreAuction, submitAuctionReview, updateFirestoreAuction, type AuctionRecord } from "@/lib/firebaseData";
import { compressImageForFirestore, firestoreImagePath } from "@/lib/firestoreImages";
import FirestoreImage from "@/components/FirestoreImage";
import { tr, useLanguage } from "@/lib/i18n";

const localDateTime = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

type Props = { actorUid: string; sellerDefault?: string; mode?: "draft" | "review"; auction?: AuctionRecord; onCreated?: () => void };
function initialForm(sellerDefault: string, auction?: AuctionRecord) {
  return {
    title: auction?.title ?? "", category: auction?.category ?? "Phones", description: auction?.description ?? "",
    sellerName: auction?.sellerName ?? sellerDefault, bidFee: String(auction?.bidFee ?? 10),
    minBid: String(auction?.minBid ?? 0.1), maxBid: String(auction?.maxBid ?? 100),
    maxBidsPerUser: String(auction?.maxBidsPerUser ?? 10),
    startsAt: localDateTime(auction?.startsAt ?? new Date(Date.now() + 5 * 60_000)),
    endsAt: localDateTime(auction?.endsAt ?? new Date(Date.now() + 3 * 86_400_000)),
  };
}

export default function AuctionForm({ actorUid, sellerDefault = "Tesaka Cherta", mode = "draft", auction, onCreated }: Props) {
  const { language } = useLanguage();
  const [form, setForm] = useState(() => initialForm(sellerDefault, auction));
  const [file, setFile] = useState<File | null>(null);
  const [previewDataUrl, setPreviewDataUrl] = useState("");
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [preparingImage, setPreparingImage] = useState(false);
  const [saving, setSaving] = useState(false);
  const selectionId = useRef(0);
  const currentImageIsFirestore = Boolean(auction && auction.imagePath === firestoreImagePath(auction.id));

  const chooseFile = async (next: File | null) => {
    const currentSelection = ++selectionId.current;
    setFile(next);
    setImageDataUrl(null);
    setPreviewDataUrl("");
    if (!next) { setPreparingImage(false); return; }
    setPreparingImage(true);
    try {
      const compressed = await compressImageForFirestore(next);
      if (currentSelection !== selectionId.current) return;
      setImageDataUrl(compressed);
      setPreviewDataUrl(compressed);
    } catch (error) {
      if (currentSelection === selectionId.current) {
        setFile(null);
        toast.error(error instanceof Error ? error.message : "Could not prepare this image.");
      }
    } finally {
      if (currentSelection === selectionId.current) setPreparingImage(false);
    }
  };

  const update = (key: keyof typeof form, value: string) => setForm((previous) => ({ ...previous, [key]: value }));
  const inputClass = "rounded-lg border border-[#d7d8c9] bg-white px-3 py-2.5 text-sm font-normal text-[#173f36]";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if ((!auction || !currentImageIsFirestore) && !file) { toast.error(tr("form.imageRequired", language)); return; }
    if (preparingImage || (file && !imageDataUrl)) { toast.info(language === "am" ? "ምስሉ እስኪዘጋጅ ይጠብቁ።" : "Wait for the image to finish preparing."); return; }
    const startsAt = new Date(form.startsAt);
    const endsAt = new Date(form.endsAt);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || startsAt <= new Date(Date.now() - 60_000) || endsAt <= startsAt) {
      toast.error(language === "am" ? "የመክፈቻና መዝጊያ ጊዜውን ያረጋግጡ።" : "Check that the opening and closing times are valid.");
      return;
    }
    setSaving(true);
    try {
      const details = {
        title: form.title, category: form.category, description: form.description, sellerName: form.sellerName,
        bidFee: Number(form.bidFee), minBid: Number(form.minBid), maxBid: Number(form.maxBid),
        maxBidsPerUser: Number(form.maxBidsPerUser), startsAt, endsAt,
      };
      if (auction) {
        await updateFirestoreAuction(actorUid, auction.id, { ...details, ...(imageDataUrl ? { imageDataUrl } : {}) });
        toast.success(language === "am" ? "ለውጦቹ እንደ ረቂቅ ተቀምጠዋል።" : "Changes saved as a draft. Review and publish when ready.");
      } else {
        if (!imageDataUrl) throw new Error("Choose a product image first.");
        const result = await createFirestoreAuction(actorUid, { ...details, imageDataUrl });
        if (mode === "review") await submitAuctionReview(actorUid, result.auctionId);
        toast.success(mode === "review" ? tr("owner.created", language) : (language === "am" ? "የጨረታ ረቂቅ ተቀምጧል።" : "Auction draft saved."));
        setForm(initialForm(sellerDefault));
      }
      setFile(null);
      setImageDataUrl(null);
      setPreviewDataUrl("");
      onCreated?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : (language === "am" ? "ዝርዝሩን ማስቀመጥ አልተቻለም።" : "Could not save the listing."));
    } finally {
      setSaving(false);
    }
  };

  return <form onSubmit={(event) => void submit(event)} className="grid gap-4 rounded-2xl border border-[#d8dfd1] bg-[#fffdf8] p-5 sm:grid-cols-2 xl:grid-cols-3">
    <label className="grid gap-1 text-xs font-bold">{tr("form.title", language)}<input required minLength={4} maxLength={220} value={form.title} onChange={(e) => update("title", e.target.value)} className={inputClass} /></label>
    <label className="grid gap-1 text-xs font-bold">{tr("form.category", language)}<input required maxLength={80} value={form.category} onChange={(e) => update("category", e.target.value)} className={inputClass} /></label>
    <label className="grid gap-1 text-xs font-bold">{tr("form.seller", language)}<input required maxLength={100} value={form.sellerName} onChange={(e) => update("sellerName", e.target.value)} className={inputClass} /></label>
    <label className="grid gap-1 text-xs font-bold sm:col-span-2 xl:col-span-3">{tr("form.description", language)}<textarea required minLength={20} maxLength={5000} rows={3} value={form.description} onChange={(e) => update("description", e.target.value)} className={inputClass} /></label>
    <label className="grid gap-2 text-xs font-bold sm:col-span-2 xl:col-span-3"><span className="inline-flex items-center gap-2"><ImagePlus size={15} />{tr("form.image", language)}</span><span className="text-[11px] font-normal text-[#7b867c]">{auction && currentImageIsFirestore ? (language === "am" ? "አማራጭ፤ አዲስ ምስል ካልመረጡ ያለው ምስል ይቀጥላል።" : "Optional: keep the current Firestore image or choose a replacement.") : auction ? (language === "am" ? "የድሮ ዝርዝር ነው፤ ከማስቀመጥ በፊት አዲስ ምስል መምረጥ አለብዎት።" : "This is a legacy listing. Choose a replacement image to move it into Firestore.") : (language === "am" ? "JPEG/PNG/WebP፤ በአሳሽ ውስጥ ወደ JPEG ይጨመቃል፤ ከዚያም በFirestore ይቀመጣል (ከ300 KB በታች)።" : "JPEG/PNG/WebP up to 12 MB; compressed in your browser and stored in Firestore under 300 KB.")}</span><input required={!auction || !currentImageIsFirestore} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => void chooseFile(e.target.files?.[0] ?? null)} className={inputClass} />{previewDataUrl ? <img src={previewDataUrl} alt="Product preview" className="h-40 w-full rounded-xl object-cover sm:max-w-sm" /> : currentImageIsFirestore ? <FirestoreImage imagePath={auction!.imagePath} alt="Current product image" className="h-40 w-full rounded-xl object-cover sm:max-w-sm" eager /> : null}{preparingImage && <div className="text-xs text-[#0b5f4a]">{language === "am" ? "ምስልን ለFirestore በማዘጋጀት ላይ…" : "Compressing image for Firestore…"}</div>}</label>
    <label className="grid gap-1 text-xs font-bold">{tr("form.fee", language)}<input required type="number" min="0" max="1000000" step="0.01" value={form.bidFee} onChange={(e) => update("bidFee", e.target.value)} className={inputClass} /></label>
    <label className="grid gap-1 text-xs font-bold">{tr("form.minimum", language)}<input required type="number" min="0.01" max="10000000" step="0.01" value={form.minBid} onChange={(e) => update("minBid", e.target.value)} className={inputClass} /></label>
    <label className="grid gap-1 text-xs font-bold">{tr("form.maximum", language)}<input required type="number" min={form.minBid} max="10000000" step="0.01" value={form.maxBid} onChange={(e) => update("maxBid", e.target.value)} className={inputClass} /></label>
    <label className="grid gap-1 text-xs font-bold">{tr("form.limit", language)}<input required type="number" min={1} max={100} step={1} value={form.maxBidsPerUser} onChange={(e) => update("maxBidsPerUser", e.target.value)} className={inputClass} /></label>
    <label className="grid gap-1 text-xs font-bold">{tr("form.opens", language)}<input required type="datetime-local" value={form.startsAt} onChange={(e) => update("startsAt", e.target.value)} className={inputClass} /></label>
    <label className="grid gap-1 text-xs font-bold">{tr("form.closes", language)}<input required type="datetime-local" value={form.endsAt} onChange={(e) => update("endsAt", e.target.value)} className={inputClass} /></label>
    <button disabled={saving || preparingImage} className="inline-flex items-center justify-center gap-2 self-end rounded-full bg-[#0b5f4a] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{saving || preparingImage ? <><LoaderCircle size={15} className="animate-spin" />{preparingImage ? (language === "am" ? "ምስል በማዘጋጀት ላይ…" : "Preparing image…") : tr("form.saving", language)}</> : auction ? (language === "am" ? "ለውጦችን አስቀምጥ" : "Save changes as draft") : mode === "review" ? tr("owner.submitReview", language) : tr("form.createDraft", language)}</button>
  </form>;
}
