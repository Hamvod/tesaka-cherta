import { describe, expect, it } from "vitest";
import { calculateLowestUniqueBid, parseAmountCents, selectLowestUniqueAmount } from "./domain";

describe("trusted auction rules", () => {
  it("parses exact cents and rejects excess decimal precision", () => {
    expect(parseAmountCents("1.25")).toBe(125);
    expect(() => parseAmountCents("1.251")).toThrow(/two decimal places/);
    expect(() => parseAmountCents(0)).toThrow(/positive/);
  });

  it("selects the lowest amount entered exactly once", () => {
    expect(calculateLowestUniqueBid([
      { id: "a", amountCents: 100 },
      { id: "b", amountCents: 100 },
      { id: "c", amountCents: 125 },
      { id: "d", amountCents: 200 },
    ])).toEqual({ id: "c", amountCents: 125 });
  });

  it("returns no winner if every amount is duplicated", () => {
    expect(calculateLowestUniqueBid([
      { id: "a", amountCents: 100 },
      { id: "b", amountCents: 100 },
    ])).toBeNull();
  });

  it("chooses the smallest server-maintained unique amount", () => {
    expect(selectLowestUniqueAmount([
      { amountCents: 500, count: 1 },
      { amountCents: 100, count: 2 },
      { amountCents: 250, count: 1 },
    ])).toBe(250);
  });
});
