import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createContext(status: "active" | "suspended" = "active"): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "payment-test-user",
    email: "payer@example.com",
    name: "Payment Test User",
    loginMethod: "password",
    role: "user",
    status,
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

  it("blocks a bidder from the admin dashboard before any database access", async () => {
    const caller = appRouter.createCaller(createContext());
    await expect(caller.admin.dashboard()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("requires authentication for private bid and win history", async () => {
    const caller = appRouter.createCaller({
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: {} as TrpcContext["res"],
    });
    await expect(caller.auction.myBids()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    await expect(caller.auction.myWins()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("blocks suspended users from protected bidder and administrator procedures", async () => {
    const caller = appRouter.createCaller(createContext("suspended"));
    await expect(caller.auction.myBids()).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.admin.dashboard()).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
