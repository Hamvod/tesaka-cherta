import { describe, expect, it } from "vitest";
import { extractTransactionNumber, inferReceiptStatusHint } from "./paymentReceiptOcr";

describe("payment receipt OCR parsing", () => {
  it("extracts a transaction number following a common receipt label", () => {
    expect(extractTransactionNumber("Transfer completed\nTransaction ID: FT-12345-XY")).toBe("FT-12345-XY");
  });

  it("recognizes a reference-style token when a label is absent", () => {
    expect(extractTransactionNumber("Ref: TXN-AB12345")).toBe("TXN-AB12345");
  });

  it("returns null when OCR found no plausible transaction number", () => {
    expect(extractTransactionNumber("Payment received. Amount: 100 ETB.")).toBeNull();
  });

  it("classifies status words only as tentative hints", () => {
    expect(inferReceiptStatusHint("Payment completed successfully")).toBe("success_terms");
    expect(inferReceiptStatusHint("Transaction failed: not completed")).toBe("failure_terms");
    expect(inferReceiptStatusHint("ክፍያ ተሳክቷል")).toBe("success_terms");
    expect(inferReceiptStatusHint("ግብይቱ አልተሳካም")).toBe("failure_terms");
    expect(inferReceiptStatusHint("Thank you for using the app")).toBe("unclear");
  });
});
