import { FormEvent, useEffect, useState } from "react";
import { ImagePlus, LoaderCircle, UploadCloud } from "lucide-react";
import { toast } from "sonner";
import { createFirestoreAuction, submitAuctionReview, updateFirestoreAuction, type AuctionRecord } from "@/lib/firebaseData";
import { uploadProductImage } from "@/lib/cloudFunctions";
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
  const [preview, setPreview] = useState(auction?.imagePath ?? "");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const update = (key: keyof typeof form, value: string) => setForm((previous) => ({ ...previous, [key]: value }));
  const inputClass = "rounded-lg border border-[#d7d8c9] bg-white px-3 py-2.5 text-sm font-normal text-[#173f36]";

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!auction && !file) { toast.error(tr("form.imageRequired", language)); return; }
    const startsAt = new Date(form.startsAt);
    const endsAt = new Date(form.endsAt);
    if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime()) || startsAt <= new Date(Date.now() - 60_000) || endsAt <= startsAt) {
      toast.error(language === "am" ? "የመክፈቻና መዝጊያ ጊዜውን ያረጋግጡ።" : "Check that the opening and closing times are valid.");
      return;
    }
    setSaving(true);
    try {
      let image = auction ? { imagePath: auction.imagePath, imageStoragePath: auction.imageStoragePath } : undefined;
      if (file) {
        setUploadProgress(0);
        image = await uploadProductImage(actorUid, file, setUploadProgress);
      }
      const details = {
        title: form.title, category: form.category, description: form.description, sellerName: form.sellerName,
        bidFee: Number(form.bidFee), minBid: Number(form.minBid), maxBid: Number(form.maxBid),
        maxBidsPerUser: Number(form.maxBidsPerUser), startsAt, endsAt,
      };
      if (auction) {
        await updateFirestoreAuction(actorUid, auction.id, { ...details, imagePath: image?.imagePath ?? auction.imagePath, imageStoragePath: file ? image?.imageStoragePath : undefined });
        toast.success(language === "am" ? "ለውጦቹ እንደ ረቂቅ ተቀምጠዋል።" : "Changes saved as a draft. Review and publish when ready.");
      } else {
        if (!image?.imageStoragePath) throw new Error("Choose a product image first.");
        const result = await createFirestoreAuction(actorUid, { ...details, imagePath: image.imagePath, imageStoragePath: image.imageStoragePath });
        if (mode === "review") await submitAuctionReview(actorUid, result.auctionId);
        toast.success(mode === "review" ? tr("owner.created", language) : (language === "am" ? "የጨረታ ረቂቅ ተቀምጧል።" : "Auction draft saved."));
        setForm(initialForm(sellerDefault));
      }
      setFile(null);
      setUploadProgress(null);
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
    <label className="grid gap-2 text-xs font-bold sm:col-span-2 xl:col-span-3"><span className="inline-flex items-center gap-2"><ImagePlus size={15} />{tr("form.image", language)}</span><span className="text-[11px] font-normal text-[#7b867c]">{auction ? (language === "am" ? "አማራጭ፤ አዲስ ምስል ካልመረጡ ያለው ምስል ይቀጥላል።" : "Optional: keep the current image or choose a replacement.") : tr("form.imageHint", language)}</span><input required={!auction} type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className={inputClass} />{preview && <img src={preview} alt="Product preview" className="h-40 w-full rounded-xl object-cover sm:max-w-sm" />}{uploadProgress !== null && <div className="flex items-center gap-2 text-xs text-[#0b5f4a]"><UploadCloud size={14} />{tr("form.uploading", language)} {uploadProgress}%</div>}</label>
    <label className="grid gap-1 text-xs font-bold">{tr("form.fee", language)}<input required type="number" min="0" max="1000000" step="0.01" value={form.bidFee} onChange={(e) => update("bidFee", e.target.value)} className={inputClass} /></label>
    <label className="grid gap-1 text-xs font-bold">{tr("form.minimum", language)}<input required type="number" min="0.01" max="10000000" step="0.01" value={form.minBid} onChange={(e) => update("minBid", e.target.value)} className={inputClass} /></label>
    <label className="grid gap-1 text-xs font-bold">{tr("form.maximum", language)}<input required type="number" min={form.minBid} max="10000000" step="0.01" value={form.maxBid} onChange={(e) => update("maxBid", e.target.value)} className={inputClass} /></label>
    <label className="grid gap-1 text-xs font-bold">{tr("form.limit", language)}<input required type="number" min={1} max={100} step={1} value={form.maxBidsPerUser} onChange={(e) => update("maxBidsPerUser", e.target.value)} className={inputClass} /></label>
    <label className="grid gap-1 text-xs font-bold">{tr("form.opens", language)}<input required type="datetime-local" value={form.startsAt} onChange={(e) => update("startsAt", e.target.value)} className={inputClass} /></label>
    <label className="grid gap-1 text-xs font-bold">{tr("form.closes", language)}<input required type="datetime-local" value={form.endsAt} onChange={(e) => update("endsAt", e.target.value)} className={inputClass} /></label>
    <button disabled={saving} className="inline-flex items-center justify-center gap-2 self-end rounded-full bg-[#0b5f4a] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60">{saving ? <><LoaderCircle size={15} className="animate-spin" />{tr("form.saving", language)}</> : auction ? (language === "am" ? "ለውጦችን አስቀምጥ" : "Save changes as draft") : mode === "review" ? tr("owner.submitReview", language) : tr("form.createDraft", language)}</button>
  </form>;
}
