import express, { type Express } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { sql } from "drizzle-orm";
import { registerStorageProxy } from "./_core/storageProxy.js";
import { ENV } from "./_core/env.js";
import { appRouter } from "./routers.js";
import { createContext } from "./_core/context.js";
import { getDb, recordTelebirrPaymentEvent } from "./db.js";
import { isSupabaseConfigured } from "./_core/supabase.js";

export function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ limit: "5mb", extended: true }));

  registerStorageProxy(app);

  // Health endpoint. Reports readiness without exposing any secret values.
  app.get("/health", async (_req, res) => {
    const startedAt = Date.now();

    let database: "up" | "down" | "not_configured" = "not_configured";
    if (ENV.databaseUrl) {
      try {
        const db = await getDb();
        if (db) {
          await db.execute(sql`select 1`);
          database = "up";
        } else {
          database = "down";
        }
      } catch {
        database = "down";
      }
    }

    const authPrimary = isSupabaseConfigured() ? "supabase" : "firebase";
    const healthy = database !== "down";

    res.status(healthy ? 200 : 503).json({
      status: healthy ? "ok" : "degraded",
      service: "tesaka-cherta",
      auth: {
        primary: authPrimary,
        supabaseConfigured: isSupabaseConfigured(),
        firebaseFallback: true,
        adminEmail: ENV.supabaseAdminEmail || null,
        adminDisplayName: ENV.adminDisplayName,
      },
      database,
      payments: {
        telebirrConfigured: Boolean(ENV.telebirrAppId && ENV.telebirrAppKey && ENV.telebirrPublicKey),
        sandboxEnabled: ENV.enableTestPayments,
      },
      uptimeMs: Date.now() - startedAt,
      timestamp: new Date().toISOString(),
      commit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
    });
  });

  app.post("/api/payments/telebirr/callback", async (req, res) => {
    const expectedSecret = ENV.telebirrCallbackSecret;
    const suppliedSecret = req.header("x-telebirr-callback-secret") ?? "";
    const expectedBytes = Buffer.from(expectedSecret);
    const suppliedBytes = Buffer.from(suppliedSecret);
    if (!expectedSecret || expectedBytes.length !== suppliedBytes.length || !timingSafeEqual(expectedBytes, suppliedBytes)) {
      res.status(401).json({ accepted: false, error: "Callback authentication failed" });
      return;
    }
    const merchantReference = typeof req.body?.merchantReference === "string" ? req.body.merchantReference : "";
    const eventType = typeof req.body?.eventType === "string" ? req.body.eventType : "unknown";
    const providerReference = typeof req.body?.providerReference === "string" ? req.body.providerReference : undefined;
    if (!merchantReference) {
      res.status(400).json({ accepted: false, error: "merchantReference is required" });
      return;
    }
    try {
      const payloadHash = createHash("sha256").update(JSON.stringify(req.body ?? {})).digest("hex");
      await recordTelebirrPaymentEvent({ merchantReference, eventType, providerReference, payloadHash });
      res.status(202).json({ accepted: true, status: "pending_verification" });
    } catch (error) {
      console.error("[Telebirr] Callback event could not be recorded", error);
      res.status(500).json({ accepted: false, error: "Unable to record payment event" });
    }
  });

  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  return app;
}
