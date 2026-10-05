import { describe, expect, it } from "vitest";
import { amountToCents, calculateLowestUniqueBid, centsToAmount, maskPhone } from "./auction-engine";

describe("lowest unique bid calculation", () => {
  it("selects the lowest amount submitted exactly once", () => {
    const result = calculateLowestUniqueBid([
      { id: 1, userId: 1, amount: "1.00" },
      { id: 2, userId: 2, amount: "1.00" },
      { id: 3, userId: 3, amount: "2.00" },
      { id: 4, userId: 4, amount: "3.00" },
      { id: 5, userId: 5, amount: "3.00" },
    ]);
    expect(result.validBidCount).toBe(5);
    expect(result.winningBid?.id).toBe(3);
  });

  it("returns no winner when every valid amount is repeated", () => {
    const result = calculateLowestUniqueBid([
      { id: 1, userId: 1, amount: "0.01" },
      { id: 2, userId: 2, amount: "0.01" },
      { id: 3, userId: 3, amount: "2.50" },
      { id: 4, userId: 4, amount: "2.50" },
    ]);
    expect(result.winningBid).toBeNull();
  });

  it("ignores invalid bids and uses exact integer cents", () => {
    const result = calculateLowestUniqueBid([
      { id: 1, userId: 1, amount: "1.10" },
      { id: 2, userId: 2, amount: "1.1" },
      { id: 3, userId: 3, amount: "0.10", status: "invalid" },
      { id: 4, userId: 4, amount: "2.00" },
    ]);
    expect(result.validBidCount).toBe(3);
    expect(result.winningBid?.id).toBe(4);
    expect(amountToCents("1.1")).toBe(110);
    expect(centsToAmount(110)).toBe("1.10");
  });

  it("masks public phone numbers", () => {
    expect(maskPhone("+251 911 234 567")).toBe("251•••••••67");
    expect(maskPhone(undefined)).toBeNull();
  });
});
