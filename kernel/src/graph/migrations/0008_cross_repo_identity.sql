-- 0008_cross_repo_identity.sql ==> Phase 16 (Plan 16-01) DEEP-06 phase-A schema.
--
-- Adds repo_id to nodes + edges with backfill to 'primary' (no-op for solo repos).
-- Backward-compatible: every existing read path is structurally unaware of repo_id;
-- the NOT NULL DEFAULT clause backfills existing rows at ALTER TABLE time per SQLite
-- 3.42+ semantics (verified — better-sqlite3 12.9.0 bundles SQLite 3.46.x).
--
-- New indexes: nodes_repo_id + edges_repo_id support future cross-repo queries
-- (Phase 17 phase-B). Both are full (non-partial) indexes — cardinality on a single
-- 'primary' value is degenerate today, but the index footprint is tiny and the
-- forward-compat surface is meaningful.
--
-- Mandate B: no DROP, no DELETE. ALTER TABLE ADD COLUMN only.
--
-- Idempotency: drizzle-kit's __drizzle_migrations table guarantees this file runs at
-- most once per database. The CREATE INDEX statements use IF NOT EXISTS to make the
-- migration safe under manual re-run (defense in depth).

ALTER TABLE nodes ADD COLUMN repo_id TEXT NOT NULL DEFAULT 'primary';
--> statement-breakpoint
ALTER TABLE edges ADD COLUMN repo_id TEXT NOT NULL DEFAULT 'primary';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS nodes_repo_id ON nodes(repo_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS edges_repo_id ON edges(repo_id);
