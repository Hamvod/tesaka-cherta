import { z } from "zod";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import * as db from "./db";

const profileInput = z.object({
  phone: z.string().trim().max(32).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  language: z.enum(["en", "am"]).optional(),
  marketingOptIn: z.number().int().min(0).max(1).optional(),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(() => {
      // Session lives in the client (Supabase Auth). The server clears any
      // in-flight state here; there is no server-side cookie to revoke.
      return { success: true } as const;
    }),
    account: protectedProcedure.query(async ({ ctx }) => {
      const [profile, userBids, savedAuctions] = await Promise.all([
        db.getOrCreateProfile(ctx.user.id),
        db.listUserBids(ctx.user.id),
        db.listUserWatchlist(ctx.user.id),
      ]);
      return { user: ctx.user, profile, bids: userBids, savedAuctions };
    }),
    updateProfile: protectedProcedure.input(profileInput).mutation(async ({ ctx, input }) => {
      const profile = await db.updateProfile(ctx.user.id, input);
      return { profile };
    }),
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
