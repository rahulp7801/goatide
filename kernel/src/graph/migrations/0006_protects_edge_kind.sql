-- 0006_protects_edge_kind.sql ==> Phase 7 (Plan 07-01) DRIFT-04 substrate.
--
-- Adds 'protects' as the fifth member of the edges.kind allowlist. SQLite forbids
-- ALTER TABLE ... ADD CHECK; Mandate B forbids DROP+RECREATE on the canonical edges
-- data table. Two complementary techniques per Pitfall 3 (07-RESEARCH.md):
--
--   1. PRAGMA writable_schema=1 + UPDATE sqlite_master SET sql=... — updates the
--      cached schema text for the original CONSTRAINT edges_kind_allowlist (defined
--      in 0000_init.sql). This is the standard SQLite recipe for a CHECK-constraint
--      change that does NOT touch row data (zero-cost, idempotent under retry).
--      Mandate B forbids DROP+RECREATE of the EDGES table; PRAGMA writable_schema
--      mutates only the schema metadata and leaves all rows intact.
--
--   2. CREATE TRIGGER edges_kind_allowlist_trigger — defense-in-depth re-enforcement
--      of the 5-member allowlist. Belt-and-suspenders against drivers that bypass
--      the CHECK or schema migrations that lose the CHECK; also covers UPDATE OF kind
--      symmetrically with INSERT.
--
-- Idempotent via DROP TRIGGER IF EXISTS preceding CREATE TRIGGER and via the literal
-- string substitution (running this migration twice yields the same sqlite_master row).
--
-- Comment block uses NO four-char dash-dash-greater sequence inside paragraphs because
-- drizzle-kit splits on that literal sequence (Plan 04-08 / 05-01 lesson). The
-- statement-breakpoint markers below are on their own lines.
PRAGMA writable_schema = 1;
--> statement-breakpoint
UPDATE sqlite_master
SET sql = replace(
    sql,
    'CHECK("edges"."kind" IN (''parent_of'',''references'',''supersedes'',''derived_from''))',
    'CHECK("edges"."kind" IN (''parent_of'',''references'',''supersedes'',''derived_from'',''protects''))'
)
WHERE type = 'table' AND name = 'edges';
--> statement-breakpoint
PRAGMA writable_schema = 0;
--> statement-breakpoint
DROP TRIGGER IF EXISTS edges_kind_allowlist_trigger;
--> statement-breakpoint
CREATE TRIGGER edges_kind_allowlist_trigger
BEFORE INSERT ON edges
FOR EACH ROW
WHEN NEW.kind NOT IN ('parent_of', 'references', 'supersedes', 'derived_from', 'protects')
BEGIN
    SELECT RAISE(ABORT, 'CHECK constraint failed: edges_kind_allowlist');
END;
--> statement-breakpoint
DROP TRIGGER IF EXISTS edges_kind_allowlist_update_trigger;
--> statement-breakpoint
CREATE TRIGGER edges_kind_allowlist_update_trigger
BEFORE UPDATE OF kind ON edges
FOR EACH ROW
WHEN NEW.kind NOT IN ('parent_of', 'references', 'supersedes', 'derived_from', 'protects')
BEGIN
    SELECT RAISE(ABORT, 'CHECK constraint failed: edges_kind_allowlist');
END;
