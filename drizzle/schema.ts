import { int, mysqlEnum, mysqlTable, timestamp, varchar, decimal, uniqueIndex } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: varchar("name", { length: 160 }),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const accountProfiles = mysqlTable("account_profiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  phone: varchar("phone", { length: 32 }),
  city: varchar("city", { length: 120 }),
  language: mysqlEnum("language", ["en", "am"]).default("en").notNull(),
  marketingOptIn: int("marketingOptIn").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const auctions = mysqlTable("auctions", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 120 }).notNull().unique(),
  title: varchar("title", { length: 220 }).notNull(),
  category: varchar("category", { length: 80 }).notNull(),
  imagePath: varchar("imagePath", { length: 500 }).notNull(),
  sellerName: varchar("sellerName", { length: 160 }).notNull(),
  bidFee: decimal("bidFee", { precision: 10, scale: 2 }).notNull(),
  endsAt: timestamp("endsAt").notNull(),
  status: mysqlEnum("status", ["draft", "live", "closed"]).default("live").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const bids = mysqlTable("bids", {
  id: int("id").autoincrement().primaryKey(),
  auctionId: int("auctionId").notNull(),
  userId: int("userId").notNull(),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  auctionUserIndex: uniqueIndex("auction_user_bid_once").on(table.auctionId, table.userId, table.amount),
}));

export const watchlist = mysqlTable("watchlist", {
  id: int("id").autoincrement().primaryKey(),
  auctionId: int("auctionId").notNull(),
  userId: int("userId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userAuctionIndex: uniqueIndex("watchlist_user_auction").on(table.userId, table.auctionId),
}));

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type AccountProfile = typeof accountProfiles.$inferSelect;
export type InsertAccountProfile = typeof accountProfiles.$inferInsert;
export type Auction = typeof auctions.$inferSelect;
export type InsertAuction = typeof auctions.$inferInsert;
export type Bid = typeof bids.$inferSelect;
export type WatchlistItem = typeof watchlist.$inferSelect;
