CREATE TABLE `account_profiles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`phone` varchar(32),
	`city` varchar(120),
	`language` enum('en','am') NOT NULL DEFAULT 'en',
	`marketingOptIn` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `account_profiles_id` PRIMARY KEY(`id`),
	CONSTRAINT `account_profiles_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `auctions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`slug` varchar(120) NOT NULL,
	`title` varchar(220) NOT NULL,
	`category` varchar(80) NOT NULL,
	`imagePath` varchar(500) NOT NULL,
	`sellerName` varchar(160) NOT NULL,
	`bidFee` decimal(10,2) NOT NULL,
	`endsAt` timestamp NOT NULL,
	`status` enum('draft','live','closed') NOT NULL DEFAULT 'live',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auctions_id` PRIMARY KEY(`id`),
	CONSTRAINT `auctions_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
CREATE TABLE `bids` (
	`id` int AUTO_INCREMENT NOT NULL,
	`auctionId` int NOT NULL,
	`userId` int NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `bids_id` PRIMARY KEY(`id`),
	CONSTRAINT `auction_user_bid_once` UNIQUE(`auctionId`,`userId`,`amount`)
);
--> statement-breakpoint
CREATE TABLE `watchlist` (
	`id` int AUTO_INCREMENT NOT NULL,
	`auctionId` int NOT NULL,
	`userId` int NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `watchlist_id` PRIMARY KEY(`id`),
	CONSTRAINT `watchlist_user_auction` UNIQUE(`userId`,`auctionId`)
);
--> statement-breakpoint
ALTER TABLE `users` MODIFY COLUMN `name` varchar(160);