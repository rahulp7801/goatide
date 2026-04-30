-- 0001_triggers.sql — defense-in-depth Mandate B enforcement (Plan 02-02)
-- Custom migration (drizzle-kit generate --custom). Triggers cannot be expressed
-- in Drizzle's TypeScript schema and must live as hand-written DDL.
--
-- Per 02-RESEARCH.md ## Pattern: Immutable Column via BEFORE UPDATE Trigger.
-- These triggers use RAISE(ABORT, ...) (Pitfall 6) — only the offending statement is
-- rolled back; better-sqlite3's db.transaction(fn) surfaces the SqliteError to the host
-- and rolls back the whole tx if one is in progress.
--
-- CREATE TRIGGER IF NOT EXISTS makes re-running this migration a no-op (idempotency).

-- nodes: recorded_at is immutable, no DELETE
CREATE TRIGGER IF NOT EXISTS nodes_recorded_at_immutable
BEFORE UPDATE OF recorded_at ON nodes
BEGIN
	SELECT RAISE(ABORT, 'recorded_at is immutable (Mandate B)');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS nodes_no_delete
BEFORE DELETE ON nodes
BEGIN
	SELECT RAISE(ABORT, 'nodes are append-only — supersede instead of delete (Mandate B)');
END;
--> statement-breakpoint
-- edges: same invariants as nodes
CREATE TRIGGER IF NOT EXISTS edges_recorded_at_immutable
BEFORE UPDATE OF recorded_at ON edges
BEGIN
	SELECT RAISE(ABORT, 'recorded_at is immutable (Mandate B)');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS edges_no_delete
BEFORE DELETE ON edges
BEGIN
	SELECT RAISE(ABORT, 'edges are append-only (Mandate B)');
END;
--> statement-breakpoint
-- provenance: completely immutable (no field updates allowed at all)
-- Note: BEFORE UPDATE (no `OF column`) — every column on provenance is immutable.
-- nodes/edges allow UPDATE OF invalidated_at, superseded_by (the supersession path),
-- so those triggers narrow to OF recorded_at.
CREATE TRIGGER IF NOT EXISTS provenance_immutable
BEFORE UPDATE ON provenance
BEGIN
	SELECT RAISE(ABORT, 'provenance records are immutable (GRAPH-05)');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS provenance_no_delete
BEFORE DELETE ON provenance
BEGIN
	SELECT RAISE(ABORT, 'provenance records are append-only (GRAPH-05)');
END;
