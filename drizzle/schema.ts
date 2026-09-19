import { decimal, integer, pgEnum, pgTable, serial, timestamp, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["user", "admin"]);
export const profileLanguage = pgEnum("profile_language", ["en", "am"]);
export const auctionStatus = pgEnum("auction_status", ["draft", "live", "closed"]);
export const paymentProvider = pgEnum("payment_provider", ["telebirr"]);
export const paymentStatus = pgEnum("payment_status", ["pending", "paid", "failed", "cancelled"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 160 }),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: userRole("role").default("user").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn", { withTimezone: true }).defaultNow().notNull(),
});

export const accountProfiles = pgTable("account_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull().unique(),
  phone: varchar("phone", { length: 32 }),
  city: varchar("city", { length: 120 }),
  language: profileLanguage("language").default("en").notNull(),
  marketingOptIn: integer("marketingOptIn").default(0).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export const auctions = pgTable("auctions", {
  id: serial("id").primaryKey(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  title: varchar("title", { length: 220 }).notNull(),
  category: varchar("category", { length: 80 }).notNull(),
  imagePath: varchar("imagePath", { length: 500 }).notNull(),
  sellerName: varchar("sellerName", { length: 160 }).notNull(),
  bidFee: decimal("bidFee", { precision: 10, scale: 2 }).notNull(),
  endsAt: timestamp("endsAt", { withTimezone: true }).notNull(),
  status: auctionStatus("status").default("live").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
});

export const bids = pgTable("bids", {
  id: serial("id").primaryKey(),
  auctionId: integer("auctionId").notNull(),
  userId: integer("userId").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  auctionUserIndex: uniqueIndex("auction_user_bid_once").on(table.auctionId, table.userId, table.amount),
}));

export const watchlist = pgTable("watchlist", {
  id: serial("id").primaryKey(),
  auctionId: integer("auctionId").notNull(),
  userId: integer("userId").notNull(),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  userAuctionIndex: uniqueIndex("watchlist_user_auction").on(table.userId, table.auctionId),
}));

export const paymentOrders = pgTable("payment_orders", {
  id: serial("id").primaryKey(),
  userId: integer("userId").notNull(),
  auctionId: integer("auctionId").notNull(),
  provider: paymentProvider("provider").default("telebirr").notNull(),
  merchantReference: varchar("merchantReference", { length: 120 }).notNull().unique(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 3 }).default("ETB").notNull(),
  status: paymentStatus("status").default("pending").notNull(),
  checkoutUrl: varchar("checkoutUrl", { length: 1000 }),
  providerReference: varchar("providerReference", { length: 180 }),
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow().notNull(),
});

export const paymentEvents = pgTable("payment_events", {
  id: serial("id").primaryKey(),
  provider: paymentProvider("provider").default("telebirr").notNull(),
  merchantReference: varchar("merchantReference", { length: 120 }).notNull(),
  eventType: varchar("eventType", { length: 80 }).notNull(),
  providerReference: varchar("providerReference", { length: 180 }),
  payloadHash: varchar("payloadHash", { length: 128 }),
  receivedAt: timestamp("receivedAt", { withTimezone: true }).defaultNow().notNull(),
}, (table) => ({
  idempotencyIndex: uniqueIndex("payment_event_idempotency").on(table.provider, table.merchantReference, table.eventType, table.providerReference),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type AccountProfile = typeof accountProfiles.$inferSelect;
export type InsertAccountProfile = typeof accountProfiles.$inferInsert;
export type Auction = typeof auctions.$inferSelect;
export type InsertAuction = typeof auctions.$inferInsert;
export type Bid = typeof bids.$inferSelect;
export type WatchlistItem = typeof watchlist.$inferSelect;
export type PaymentOrder = typeof paymentOrders.$inferSelect;
export type PaymentEvent = typeof paymentEvents.$inferSelect;
