export type BidEntry = { id: string; amount: number };

export const amountToCents = (amount: number): number => {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Bid amount must be a positive number.");
  const cents = Math.round(amount * 100);
  if (Math.abs(cents / 100 - amount) > 1e-8) throw new Error("Bid amount must have no more than two decimal places.");
  return cents;
};

export function calculateLowestUniqueBid(entries: BidEntry[]): BidEntry | null {
  const centsById = entries.map((entry) => ({ ...entry, cents: amountToCents(entry.amount) }));
  const frequencies = new Map<number, number>();
  for (const entry of centsById) frequencies.set(entry.cents, (frequencies.get(entry.cents) ?? 0) + 1);
  const winner = centsById
    .filter((entry) => frequencies.get(entry.cents) === 1)
    .sort((left, right) => left.cents - right.cents || left.id.localeCompare(right.id))[0];
  return winner ? { id: winner.id, amount: winner.cents / 100 } : null;
}
