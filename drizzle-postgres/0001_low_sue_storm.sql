CREATE TYPE "public"."bid_status" AS ENUM('valid', 'invalid');--> statement-breakpoint
CREATE TYPE "public"."result_type" AS ENUM('winner', 'no_unique_bid');--> statement-breakpoint
CREATE TABLE "auction_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"auctionId" integer NOT NULL,
	"resultType" "result_type" NOT NULL,
	"winningBidId" integer,
	"winnerUserId" integer,
	"winningAmount" numeric(10, 2),
	"validBidCount" integer DEFAULT 0 NOT NULL,
	"referenceCode" varchar(64) NOT NULL,
	"resultHash" varchar(64) NOT NULL,
	"calculatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"publishedAt" timestamp with time zone,
	CONSTRAINT "auction_results_auctionId_unique" UNIQUE("auctionId"),
	CONSTRAINT "auction_results_referenceCode_unique" UNIQUE("referenceCode")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"actorId" integer,
	"action" varchar(100) NOT NULL,
	"entityType" varchar(80) NOT NULL,
	"entityId" varchar(120) NOT NULL,
	"oldValue" jsonb,
	"newValue" jsonb,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auctions" ADD COLUMN "startsAt" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "auctions" ADD COLUMN "minBid" numeric(10, 2) DEFAULT '0.01' NOT NULL;--> statement-breakpoint
ALTER TABLE "auctions" ADD COLUMN "maxBid" numeric(10, 2) DEFAULT '100.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "auctions" ADD COLUMN "maxBidsPerUser" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "bids" ADD COLUMN "paymentOrderId" integer;--> statement-breakpoint
ALTER TABLE "bids" ADD COLUMN "status" "bid_status" DEFAULT 'valid' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "bids_payment_order_once" ON "bids" USING btree ("paymentOrderId");