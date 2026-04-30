CREATE TABLE `receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`change_id` text NOT NULL,
	`citations` text NOT NULL,
	`drill_chain` text NOT NULL,
	`destructive` integer NOT NULL,
	`graph_snapshot_tx_time` text NOT NULL,
	`recorded_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `receipts_change_id` ON `receipts` (`change_id`);
