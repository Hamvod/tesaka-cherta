CREATE TYPE "public"."auction_status" AS ENUM('draft', 'live', 'closed');--> statement-breakpoint
CREATE TYPE "public"."payment_provider" AS ENUM('telebirr');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('pending', 'paid', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."profile_language" AS ENUM('en', 'am');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'admin');--> statement-breakpoint
CREATE TABLE "account_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"phone" varchar(32),
	"city" varchar(120),
	"language" "profile_language" DEFAULT 'en' NOT NULL,
	"marketingOptIn" integer DEFAULT 0 NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_profiles_userId_unique" UNIQUE("userId")
);
--> statement-breakpoint
CREATE TABLE "auctions" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" varchar(120) NOT NULL,
	"title" varchar(220) NOT NULL,
	"category" varchar(80) NOT NULL,
	"imagePath" varchar(500) NOT NULL,
	"sellerName" varchar(160) NOT NULL,
	"bidFee" numeric(10, 2) NOT NULL,
	"endsAt" timestamp with time zone NOT NULL,
	"status" "auction_status" DEFAULT 'live' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auctions_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "bids" (
	"id" serial PRIMARY KEY NOT NULL,
	"auctionId" integer NOT NULL,
	"userId" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"provider" "payment_provider" DEFAULT 'telebirr' NOT NULL,
	"merchantReference" varchar(120) NOT NULL,
	"eventType" varchar(80) NOT NULL,
	"providerReference" varchar(180),
	"payloadHash" varchar(128),
	"receivedAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"userId" integer NOT NULL,
	"auctionId" integer NOT NULL,
	"provider" "payment_provider" DEFAULT 'telebirr' NOT NULL,
	"merchantReference" varchar(120) NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'ETB' NOT NULL,
	"status" "payment_status" DEFAULT 'pending' NOT NULL,
	"checkoutUrl" varchar(1000),
	"providerReference" varchar(180),
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_orders_merchantReference_unique" UNIQUE("merchantReference")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"openId" varchar(64) NOT NULL,
	"name" varchar(160),
	"email" varchar(320),
	"loginMethod" varchar(64),
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL,
	"updatedAt" timestamp with time zone DEFAULT now() NOT NULL,
	"lastSignedIn" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_openId_unique" UNIQUE("openId")
);
--> statement-breakpoint
CREATE TABLE "watchlist" (
	"id" serial PRIMARY KEY NOT NULL,
	"auctionId" integer NOT NULL,
	"userId" integer NOT NULL,
	"createdAt" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "auction_user_bid_once" ON "bids" USING btree ("auctionId","userId","amount");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_event_idempotency" ON "payment_events" USING btree ("provider","merchantReference","eventType","providerReference");--> statement-breakpoint
CREATE UNIQUE INDEX "watchlist_user_auction" ON "watchlist" USING btree ("userId","auctionId");