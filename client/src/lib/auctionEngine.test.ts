import { describe, expect, it } from "vitest";
import { amountToCents, calculateLowestUniqueBid } from "./auctionEngine";

describe("calculateLowestUniqueBid", () => {
  it("selects the lowest amount that appears exactly once", () => {
    expect(calculateLowestUniqueBid([
      { id: "a", amount: 1.25 },
      { id: "b", amount: 0.75 },
      { id: "c", amount: 0.75 },
      { id: "d", amount: 1.5 },
    ])).toEqual({ id: "a", amount: 1.25 });
  });

  it("returns no winner when every submitted amount is duplicated", () => {
    expect(calculateLowestUniqueBid([
      { id: "a", amount: 1 },
      { id: "b", amount: 1 },
      { id: "c", amount: 2 },
      { id: "d", amount: 2 },
    ])).toBeNull();
  });

  it("uses exact cents for duplicate detection and deterministic ties", () => {
    expect(calculateLowestUniqueBid([
      { id: "z", amount: 1.1 },
      { id: "a", amount: 1.1 },
      { id: "b", amount: 1.12 },
    ])).toEqual({ id: "b", amount: 1.12 });
    expect(amountToCents(1.1)).toBe(110);
  });

  it("rejects non-positive and greater-than-two-decimal amounts", () => {
    expect(() => amountToCents(0)).toThrow("positive number");
    expect(() => amountToCents(1.234)).toThrow("two decimal places");
  });

  it("returns null for an empty auction", () => {
    expect(calculateLowestUniqueBid([])).toBeNull();
  });
});
