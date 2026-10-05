import { z } from "zod";
import { systemRouter } from "./_core/systemRouter";
import { adminProcedure, publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import * as db from "./db";
import { ENV } from "./_core/env";

const amountPattern = /^\d+(\.\d{1,2})?$/;
const amountField = z.string().regex(amountPattern, "Enter a valid amount with up to two decimal places");

function badRequest(error: unknown, fallback: string): never {
  throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : fallback });
}

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
  }),
  auction: router({
    list: publicProcedure.query(() => db.listLiveAuctions()),
    byId: publicProcedure.input(z.object({ id: z.number().int().positive() })).query(({ input }) => db.getAuctionById(input.id)),
    results: publicProcedure.query(() => db.listPublishedResults()),
    myBids: protectedProcedure.query(({ ctx }) => db.listUserBids(ctx.user.id)),
    myWins: protectedProcedure.query(({ ctx }) => db.listUserWins(ctx.user.id)),
    submitBid: protectedProcedure.input(z.object({
      auctionId: z.number().int().positive(),
      amount: amountField,
      paymentOrderId: z.number().int().positive(),
    })).mutation(async ({ ctx, input }) => {
      try {
        const amount = Number(input.amount);
        if (!Number.isFinite(amount) || amount <= 0) throw new Error("Bid amount must be greater than zero");
        return await db.createBid(ctx.user.id, input.auctionId, amount.toFixed(2), input.paymentOrderId);
      } catch (error) {
        return badRequest(error, "Unable to submit bid");
      }
    }),
    toggleWatchlist: protectedProcedure.input(z.object({ auctionId: z.number().int().positive() })).mutation(({ ctx, input }) => db.toggleWatchlist(ctx.user.id, input.auctionId)),
  }),
  profile: router({
    sync: protectedProcedure.input(z.object({
      phone: z.string().trim().max(32).nullable(),
      city: z.string().trim().max(120).nullable(),
      language: z.enum(["en", "am"]),
      marketingOptIn: z.boolean(),
    })).mutation(({ ctx, input }) => db.updateProfile(ctx.user.id, {
      ...input,
      marketingOptIn: input.marketingOptIn ? 1 : 0,
    })),
  }),
  support: router({
    myReports: protectedProcedure.query(({ ctx }) => db.listUserReports(ctx.user.id)),
    submitReport: protectedProcedure.input(z.object({
      category: z.enum(["account", "auction", "payment", "safety", "other"]),
      subject: z.string().trim().min(4).max(160),
      details: z.string().trim().min(20).max(4000),
      targetType: z.enum(["auction", "payment", "user"]).nullable().optional(),
      targetId: z.string().trim().max(120).nullable().optional(),
    })).mutation(async ({ ctx, input }) => {
      try {
        return await db.submitUserReport(ctx.user.id, input);
      } catch (error) {
        return badRequest(error, "Unable to submit report");
      }
    }),
  }),
  payment: router({
    mode: publicProcedure.query(() => ({ sandboxEnabled: ENV.enableTestPayments, telebirrCheckoutReady: false })),
    prepareTelebirr: protectedProcedure.input(z.object({ auctionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try {
        return await db.createTelebirrPaymentOrder(ctx.user.id, input.auctionId);
      } catch (error) {
        return badRequest(error, "Unable to prepare payment");
      }
    }),
    completeSandbox: protectedProcedure.input(z.object({ paymentOrderId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try {
        return await db.completeSandboxPayment(ctx.user.id, input.paymentOrderId);
      } catch (error) {
        return badRequest(error, "Unable to complete sandbox payment");
      }
    }),
    latestForAuction: protectedProcedure.input(z.object({ auctionId: z.number().int().positive() })).query(({ ctx, input }) => db.getLatestUserPaymentOrder(ctx.user.id, input.auctionId)),
  }),
  admin: router({
    dashboard: adminProcedure.query(() => db.getAdminDashboardStats()),
    auctions: adminProcedure.query(() => db.listAdminAuctions()),
    users: adminProcedure.query(() => db.listAdminUsers()),
    reports: adminProcedure.query(() => db.listAdminReports()),
    payments: adminProcedure.query(() => db.listAdminPayments()),
    audit: adminProcedure.query(() => db.listAuditLogs()),
    updateUserStatus: adminProcedure.input(z.object({ userId: z.number().int().positive(), status: z.enum(["active", "suspended"]) })).mutation(async ({ ctx, input }) => {
      try {
        return await db.updateUserStatus(ctx.user.id, input.userId, input.status);
      } catch (error) {
        return badRequest(error, "Unable to update user status");
      }
    }),
    reviewReport: adminProcedure.input(z.object({
      reportId: z.number().int().positive(),
      status: z.enum(["open", "reviewing", "resolved", "dismissed"]),
      adminNotes: z.string().trim().max(2000).nullable(),
    })).mutation(async ({ ctx, input }) => {
      try {
        return await db.updateAdminReport(ctx.user.id, input.reportId, input.status, input.adminNotes);
      } catch (error) {
        return badRequest(error, "Unable to update report");
      }
    }),
    createAuction: adminProcedure.input(z.object({
      title: z.string().trim().min(3).max(220),
      category: z.string().trim().min(2).max(80),
      imagePath: z.string().trim().min(1).max(500),
      sellerName: z.string().trim().min(2).max(160),
      bidFee: amountField,
      startsAt: z.coerce.date(),
      endsAt: z.coerce.date(),
      minBid: amountField,
      maxBid: amountField,
      maxBidsPerUser: z.number().int().min(1).max(100),
    })).mutation(async ({ ctx, input }) => {
      try {
        return await db.createAuction(ctx.user.id, input);
      } catch (error) {
        return badRequest(error, "Unable to create auction");
      }
    }),
    publishAuction: adminProcedure.input(z.object({ auctionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try {
        return await db.publishAuction(ctx.user.id, input.auctionId);
      } catch (error) {
        return badRequest(error, "Unable to publish auction");
      }
    }),
    closeAuction: adminProcedure.input(z.object({ auctionId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      try {
        return await db.closeAuction(input.auctionId, ctx.user.id);
      } catch (error) {
        return badRequest(error, "Unable to close auction");
      }
    }),
  }),
});

export type AppRouter = typeof appRouter;
