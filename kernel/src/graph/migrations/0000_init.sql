CREATE TABLE `nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`payload` text NOT NULL,
	`confidence` text NOT NULL,
	`valid_from` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`invalidated_at` text,
	`recorded_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`superseded_by` text,
	CONSTRAINT `nodes_kind_allowlist` CHECK("nodes"."kind" IN ('ConstraintNode','DecisionNode','ContractNode','OpenQuestion','Attempt')),
	CONSTRAINT `nodes_confidence_enum` CHECK("nodes"."confidence" IN ('Explicit','Inferred')),
	CONSTRAINT `nodes_payload_is_json` CHECK(json_valid("nodes"."payload")),
	CONSTRAINT `nodes_ghosting_rule` CHECK(
		instr(lower(coalesce(json_extract("nodes"."payload", '$.body'), '')), 'thanks')   = 0 AND
		instr(lower(coalesce(json_extract("nodes"."payload", '$.body'), '')), 'finished') = 0 AND
		instr(lower(coalesce(json_extract("nodes"."payload", '$.body'), '')), 'summary')  = 0
	)
);
--> statement-breakpoint
CREATE INDEX `nodes_kind_active` ON `nodes` (`kind`) WHERE "nodes"."invalidated_at" IS NULL;--> statement-breakpoint
CREATE INDEX `nodes_invalidated_at` ON `nodes` (`invalidated_at`);--> statement-breakpoint
CREATE TABLE `edges` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`src_id` text NOT NULL,
	`dst_id` text NOT NULL,
	`valid_from` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`invalidated_at` text,
	`recorded_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`superseded_by` text,
	CONSTRAINT `edges_kind_allowlist` CHECK("edges"."kind" IN ('parent_of','references','supersedes','derived_from')),
	CONSTRAINT `edges_src_fk` FOREIGN KEY (`src_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT `edges_dst_fk` FOREIGN KEY (`dst_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `edges_active_src` ON `edges` (`src_id`) WHERE "edges"."invalidated_at" IS NULL;--> statement-breakpoint
CREATE INDEX `edges_active_dst` ON `edges` (`dst_id`) WHERE "edges"."invalidated_at" IS NULL;--> statement-breakpoint
CREATE TABLE `provenance` (
	`node_id` text PRIMARY KEY NOT NULL,
	`source` text NOT NULL,
	`actor` text NOT NULL,
	`recorded_at` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`detail` text,
	CONSTRAINT `provenance_node_fk` FOREIGN KEY (`node_id`) REFERENCES `nodes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE VIEW `active_nodes` AS select "id", "kind", "payload", "confidence", "valid_from", "invalidated_at", "recorded_at", "superseded_by" from "nodes" where "nodes"."invalidated_at" is null;
