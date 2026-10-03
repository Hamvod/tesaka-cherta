import express, { type Express } from "express";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerStorageProxy } from "./_core/storageProxy";
import { appRouter } from "./routers";
import { createContext } from "./_core/context";
import { recordTelebirrPaymentEvent } from "./db";

export function createApp(): Express {
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ limit: "5mb", extended: true }));

  registerStorageProxy(app);

  app.post("/api/payments/telebirr/callback", async (req, res) => {
    const merchantReference = typeof req.body?.merchantReference === "string" ? req.body.merchantReference : "";
    const eventType = typeof req.body?.eventType === "string" ? req.body.eventType : "unknown";
    const providerReference = typeof req.body?.providerReference === "string" ? req.body.providerReference : undefined;
    if (!merchantReference) {
      res.status(400).json({ accepted: false, error: "merchantReference is required" });
      return;
    }
    try {
      await recordTelebirrPaymentEvent({ merchantReference, eventType, providerReference });
      res.status(202).json({ accepted: true, status: "pending_verification" });
    } catch (error) {
      console.error("[Telebirr] Callback event could not be recorded", error);
      res.status(500).json({ accepted: false, error: "Unable to record payment event" });
    }
  });

  app.use("/api/trpc", createExpressMiddleware({ router: appRouter, createContext }));
  return app;
}
