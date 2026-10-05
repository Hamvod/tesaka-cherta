import express, { type Express } from "express";
import { createHash, timingSafeEqual } from "node:crypto";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageProxy } from "./_core/storageProxy";
import { ENV } from "./_core/env";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { recordTelebirrPaymentEvent } from "./db";

export function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ limit: "5mb", extended: true }));

  registerStorageProxy(app);

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
