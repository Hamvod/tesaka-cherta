export type ReceiptStatusHint = "success_terms" | "failure_terms" | "unclear";

export function inferReceiptStatusHint(text: string): ReceiptStatusHint {
  const normalized = text.toLowerCase();
  if (/\b(failed|failure|declined|reversed|cancelled|canceled|unsuccessful)\b|\bnot\s+(?:successful|completed|paid)\b|(?:አልተሳካም|አልተፈጸመም|ተሰርዟል)/.test(normalized)) return "failure_terms";
  if (/\b(successful|success|completed|complete|paid|payment received|transfer successful)\b|(?:ተሳክቷል|ተጠናቋል|ተከፍሏል)/.test(normalized)) return "success_terms";
  return "unclear";
}

export function extractTransactionNumber(text: string): string | null {
  const patterns = [
    /(?:transaction|reference|ref|receipt|txn\s+(?:id|no\.?|number))\s*(?:id|no\.?|number|ref(?:erence)?)?\s*[:#-]\s*([A-Z0-9][A-Z0-9-]{4,39})/i,
    /\b(?:FT|TXN|TRX|REF)[- ]?[A-Z0-9-]{5,38}\b/i,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    const candidate = match?.[1] ?? match?.[0];
    if (candidate) return candidate.trim().slice(0, 160);
  }
  return null;
}

export async function scanPaymentReceipt(file: File, onProgress?: (percent: number) => void, language: "en" | "am" = "en"): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker(language === "am" ? "eng+amh" : "eng", 1, {
    logger: (message) => {
      if (message.status === "recognizing text" && Number.isFinite(message.progress)) {
        onProgress?.(Math.round(message.progress * 100));
      }
    },
  });
  try {
    const result = await worker.recognize(file);
    return result.data.text.trim().slice(0, 6000);
  } finally {
    await worker.terminate();
  }
}
