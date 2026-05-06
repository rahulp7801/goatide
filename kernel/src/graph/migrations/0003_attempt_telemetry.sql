-- 0003_attempt_telemetry.sql — Phase 4 (Plan 04-01) attempt-payload telemetry indexes.
--
-- Phase-2 nodes table stores Attempt nodes with payload JSON. Phase 4 extends
-- AttemptPayload at the Zod layer (Plan 04-02) to include accept_latency_ms + tier.
-- This migration adds two partial indexes so the Phase-4 queries (kernel.recordRejection
-- locating the originating Attempt by change_id; phase-verify benchmark scan by
-- attempt_kind) stay fast on a 10K-node graph.
--
-- Hand-authored (matches Phase-2 + Phase-3 convention — Plan 03-01 SUMMARY note about
-- 0002_receipts.sql lacking a meta/0002_snapshot.json).

CREATE INDEX `attempts_by_kind` ON `nodes`(json_extract(`payload`, '$.attempt_kind')) WHERE `kind` = 'Attempt';
--> statement-breakpoint
CREATE INDEX `attempts_by_change` ON `nodes`(json_extract(`payload`, '$.detail.change_id')) WHERE `kind` = 'Attempt';
