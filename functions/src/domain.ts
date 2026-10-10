export type BidEntry = { id: string; amountCents: number };

export function parseAmountCents(value: unknown): number {
  const amount = typeof value === "string" ? Number(value) : value;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new Error("Bid amount must be a positive number.");
  }
  const cents = Math.round(amount * 100);
  if (Math.abs(cents / 100 - amount) > 1e-8) {
    throw new Error("Bid amount must have no more than two decimal places.");
  }
  return cents;
}

export function selectLowestUniqueAmount(counts: Array<{ amountCents: number; count: number }>): number | null {
  return counts
    .filter((item) => Number.isInteger(item.amountCents) && item.amountCents > 0 && item.count === 1)
    .map((item) => item.amountCents)
    .sort((a, b) => a - b)[0] ?? null;
}

export function calculateLowestUniqueBid(entries: BidEntry[]): BidEntry | null {
  const frequencies = new Map<number, number>();
  for (const entry of entries) {
    if (!Number.isInteger(entry.amountCents) || entry.amountCents <= 0) {
      throw new Error("Bid amounts must be positive integer cents.");
    }
    frequencies.set(entry.amountCents, (frequencies.get(entry.amountCents) ?? 0) + 1);
  }
  const winner = entries
    .filter((entry) => frequencies.get(entry.amountCents) === 1)
    .sort((left, right) => left.amountCents - right.amountCents || left.id.localeCompare(right.id))[0];
  return winner ?? null;
}
