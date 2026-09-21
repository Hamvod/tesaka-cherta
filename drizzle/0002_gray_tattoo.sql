CREATE TABLE `payment_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`provider` enum('telebirr') NOT NULL DEFAULT 'telebirr',
	`merchantReference` varchar(120) NOT NULL,
	`eventType` varchar(80) NOT NULL,
	`providerReference` varchar(180),
	`payloadHash` varchar(128),
	`receivedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `payment_events_id` PRIMARY KEY(`id`),
	CONSTRAINT `payment_event_idempotency` UNIQUE(`provider`,`merchantReference`,`eventType`,`providerReference`)
);
--> statement-breakpoint
CREATE TABLE `payment_orders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`auctionId` int NOT NULL,
	`provider` enum('telebirr') NOT NULL DEFAULT 'telebirr',
	`merchantReference` varchar(120) NOT NULL,
	`amount` decimal(10,2) NOT NULL,
	`currency` varchar(3) NOT NULL DEFAULT 'ETB',
	`status` enum('pending','paid','failed','cancelled') NOT NULL DEFAULT 'pending',
	`checkoutUrl` varchar(1000),
	`providerReference` varchar(180),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `payment_orders_id` PRIMARY KEY(`id`),
	CONSTRAINT `payment_orders_merchantReference_unique` UNIQUE(`merchantReference`)
);
