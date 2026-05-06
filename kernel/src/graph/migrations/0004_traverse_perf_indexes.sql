--------------------------------------------------------------------------------
-- Migration 0004: Traverse perf — bitemporal-active partial indexes
--
-- Phase 4 gap-closure (W12, .planning/phases/04-verification-canvas-per-save-tiered/04-VERIFICATION.md).
-- The recursive-CTE traverse (kernel/src/graph/traverse.ts) joins edges with the predicate
-- `invalidated_at IS NULL OR invalidated_at > @at`. The existing Phase-2 indexes don't cover
-- the bitemporal-active subset, so SQLite falls back to a sequential scan on edges for the
-- per-level edge lookups. These partial indexes cover the active subset directly.
--
-- Scope: edges(src_id, kind) WHERE invalidated_at IS NULL — covers `e.src_id = f.node_id`
--        edges(dst_id, kind) WHERE invalidated_at IS NULL — covers `e.dst_id = f.node_id`
--        nodes(kind)         WHERE invalidated_at IS NULL — covers contract-allowlist scans
--                                                          and per-level node-attribute joins
--
-- The `WHERE invalidated_at IS NULL` predicate matches the `recorded_at <= @at` clause
-- approximately for the dominant query shape (current-time queries); historical queries
-- with `at` in the past still benefit because the active subset is the smallest segment
-- of the table by row count.
--
-- See also: kernel/src/graph/traverse.ts ## PHASE-4 GAP-CLOSURE for the JS-iterative-BFS
-- rewrite that consumes these indexes per-level.
--
-- Cross-statement framing: drizzle-kit's better-sqlite3 migrator runs each migration file
-- via a single `prepare()` call, which does NOT support multiple SQL statements. The
-- statement-breakpoint marker (also used by 0001_triggers.sql) splits this file into
-- separately-prepared statements at migration time.
--------------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_edges_active_src
  ON edges(src_id, kind)
  WHERE invalidated_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_edges_active_dst
  ON edges(dst_id, kind)
  WHERE invalidated_at IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_nodes_active_kind
  ON nodes(kind)
  WHERE invalidated_at IS NULL;
