import { z } from "zod";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import * as db from "./db";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
  }),
  auction: router({
    list: publicProcedure.query(() => db.listLiveAuctions()),
    byId: publicProcedure.input(z.object({ id: z.number().int().positive() })).query(({ input }) => db.getAuctionById(input.id)),
    submitBid: protectedProcedure.input(z.object({
      auctionId: z.number().int().positive(),
      amount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Enter a valid bid amount"),
      paymentOrderId: z.number().int().positive(),
    })).mutation(async ({ ctx, input }) => {
      try {
        const amount = Number(input.amount);
        if (!Number.isFinite(amount) || amount <= 0) throw new Error("Bid amount must be greater than zero");
        return await db.createBid(ctx.user.id, input.auctionId, amount.toFixed(2), input.paymentOrderId);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to submit bid" });
      }
    }),
    toggleWatchlist: protectedProcedure.input(z.object({ auctionId: z.number().int().positive() })).mutation(({ ctx, input }) => db.toggleWatchlist(ctx.user.id, input.auctionId)),
  }),
  payment: router({
    prepareTelebirr: protectedProcedure.input(z.object({ auctionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try {
        return await db.createTelebirrPaymentOrder(ctx.user.id, input.auctionId);
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Unable to prepare payment" });
      }
    }),
    latestForAuction: protectedProcedure.input(z.object({ auctionId: z.number().int().positive() })).query(({ ctx, input }) => db.getLatestUserPaymentOrder(ctx.user.id, input.auctionId)),
  }),
});

export type AppRouter = typeof appRouter;
