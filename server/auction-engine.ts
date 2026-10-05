export type BidCandidate = {
  id: number;
  userId: number;
  amount: string;
  status?: "valid" | "invalid";
};

export type LowestUniqueResult = {
  validBidCount: number;
  winningBid: BidCandidate | null;
  countsByAmount: ReadonlyMap<number, number>;
};

/** Parse a currency amount without floating-point rounding. */
export function amountToCents(amount: string): number {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(amount.trim());
  if (!match) throw new Error("Bid amount must have at most two decimal places");
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(2, "0"));
  const cents = whole * 100 + fraction;
  if (!Number.isSafeInteger(cents)) throw new Error("Bid amount is outside the supported range");
  return cents;
}

export function centsToAmount(cents: number): string {
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("Invalid amount in cents");
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`;
}

/** The winner is the participant with the lowest exact amount occurring once. */
export function calculateLowestUniqueBid(bids: readonly BidCandidate[]): LowestUniqueResult {
  const validBids = bids.filter((bid) => (bid.status ?? "valid") === "valid");
  const counts = new Map<number, number>();
  for (const bid of validBids) {
    const cents = amountToCents(bid.amount);
    counts.set(cents, (counts.get(cents) ?? 0) + 1);
  }

  const winningBid = validBids
    .filter((bid) => counts.get(amountToCents(bid.amount)) === 1)
    .sort((a, b) => amountToCents(a.amount) - amountToCents(b.amount) || a.id - b.id)[0] ?? null;

  return { validBidCount: validBids.length, winningBid, countsByAmount: counts };
}

export function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 5) return "••••";
  return `${digits.slice(0, 3)}${"•".repeat(Math.max(3, digits.length - 5))}${digits.slice(-2)}`;
}
