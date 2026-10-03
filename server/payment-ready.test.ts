import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "payment-test-user",
    email: "payer@example.com",
    name: "Payment Test User",
    loginMethod: "password",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("payment-ready bid safeguards", () => {
  it("requires a payment order id before a bid can be accepted", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.auction.submitBid({ auctionId: 1, amount: "2.50", paymentOrderId: 0 })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("exposes the Telebirr preparation contract for authenticated users", () => {
    const caller = appRouter.createCaller(createContext());
    expect(caller.payment.prepareTelebirr).toBeTypeOf("function");
    expect(caller.payment.latestForAuction).toBeTypeOf("function");
  });
});
