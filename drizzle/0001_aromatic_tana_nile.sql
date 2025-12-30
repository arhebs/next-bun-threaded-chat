CREATE TABLE `consumed_confirmations` (
	`token` text PRIMARY KEY NOT NULL,
	`action` text NOT NULL,
	`action_payload_json` text NOT NULL,
	`consumed_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_consumed_confirmations_consumed` ON `consumed_confirmations` (`consumed_at`);