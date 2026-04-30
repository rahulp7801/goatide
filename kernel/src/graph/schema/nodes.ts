// kernel/src/graph/schema/nodes.ts — Phase 2 (Plan 02-02) bitemporal nodes table.
//
// This is the structural spine of the graph. Every "thing the developer cares about"
// (constraint, decision, contract, open question, attempt) is a node row. The table
// carries four bitemporal timestamps (GRAPH-02), an immutable `recorded_at` (GRAPH-03),
// a confidence enum (GRAPH-05), a kind allowlist + Ghosting CHECK (GRAPH-06 / Mandate B),
// and is append-only via the BEFORE-DELETE trigger declared in 0001_triggers.sql.
//
// Per 02-RESEARCH.md ## Pattern: Schema Shape and ## Pitfall 5 (NULL-body Ghosting bypass).
// Pitfall 5 fix: the Ghosting CHECK uses `coalesce(json_extract(payload, '$.body'), '')`
// so a missing body PASSES Ghosting (a missing body is a Zod failure in Wave 2, not a
// trigger violation here).

import { sql } from 'drizzle-orm';
import { sqliteTable, text, check, index } from 'drizzle-orm/sqlite-core';

export const NODE_KINDS = ['ConstraintNode', 'DecisionNode', 'ContractNode', 'OpenQuestion', 'Attempt'] as const;
export type NodeKind = typeof NODE_KINDS[number];

export const CONFIDENCE_VALUES = ['Explicit', 'Inferred'] as const;
export type Confidence = typeof CONFIDENCE_VALUES[number];

export const GHOSTING_TOKENS = ['thanks', 'finished', 'summary'] as const;

// Payload type is intentionally loose at the Drizzle layer — Zod (Wave 2) provides the typed
// boundary. Keeping the schema-side type loose lets `db.ts` and DAO code type-narrow at the
// Zod boundary without fighting Drizzle's generic plumbing.
export const nodes = sqliteTable('nodes', {
	id: text('id').primaryKey(),                                  // ULID (26 chars)
	kind: text('kind').notNull(),
	payload: text('payload', { mode: 'json' })
		.notNull()
		.$type<{ kind: NodeKind; body: string; [k: string]: unknown }>(),
	confidence: text('confidence').notNull(),
	valid_from: text('valid_from').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
	invalidated_at: text('invalidated_at'),
	recorded_at: text('recorded_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
	// FK on superseded_by → nodes.id is enforced as a soft constraint by the DAO (Wave 2).
	// SQLite's self-referential FKs interact awkwardly with append-only triggers; the DAO
	// owns this validation.
	superseded_by: text('superseded_by'),
}, (t) => [
	check('nodes_kind_allowlist',
		sql`${t.kind} IN ('ConstraintNode','DecisionNode','ContractNode','OpenQuestion','Attempt')`),
	check('nodes_confidence_enum',
		sql`${t.confidence} IN ('Explicit','Inferred')`),
	check('nodes_payload_is_json',
		sql`json_valid(${t.payload})`),
	// Pitfall 5: coalesce NULL body to '' so `instr` always returns 0 for missing bodies.
	// Pitfall 8: never substring-match the whole JSON; always extract '$.body' first.
	check('nodes_ghosting_rule', sql`
		instr(lower(coalesce(json_extract(${t.payload}, '$.body'), '')), 'thanks')   = 0 AND
		instr(lower(coalesce(json_extract(${t.payload}, '$.body'), '')), 'finished') = 0 AND
		instr(lower(coalesce(json_extract(${t.payload}, '$.body'), '')), 'summary')  = 0
	`),
	// Phase-3 query ergonomics: partial index on active rows by kind.
	index('nodes_kind_active').on(t.kind).where(sql`${t.invalidated_at} IS NULL`),
	// Phase-3 traversal needs to filter on this column.
	index('nodes_invalidated_at').on(t.invalidated_at),
]);
