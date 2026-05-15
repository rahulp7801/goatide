// kernel/src/graph/schema/edges.ts — Phase 2 (Plan 02-02) bitemporal edges table.
//
// Edges connect nodes through typed relationships. Same four bitemporal timestamps as
// `nodes` (GRAPH-02), same immutability guarantees from triggers (GRAPH-03/04), kind
// allowlist via CHECK (GRAPH-06).
//
// Per 02-RESEARCH.md ## Pattern: Schema Shape, ## Pitfall 12 (no ON DELETE CASCADE).
// No cascade: append-only means no parent ever vanishes, and cascade would interact
// weirdly with the BEFORE-DELETE trigger anyway.

import { sql } from 'drizzle-orm';
import { sqliteTable, text, check, foreignKey, index } from 'drizzle-orm/sqlite-core';
import { nodes } from './nodes.js';

// Phase 7 Plan 07-01: 'protects' edge kind for ContractNode → downstream-affected node ripple
// analysis (DRIFT-04). Pitfall 3 in 07-RESEARCH.md: SQLite forbids ALTER TABLE ... ADD CHECK
// and Mandate B forbids DROP+RECREATE on the canonical edges table. Migration
// 0006_protects_edge_kind.sql installs a TRIGGER that re-enforces this 5-member allowlist
// (the schema-defined CHECK below stays at 4 because Drizzle reads schema/edges.ts only at
// fresh-init time; the trigger covers existing DBs and the schema CHECK below covers DBs
// that drop and recreate edges from this declaration).
export const EDGE_KINDS = ['parent_of', 'references', 'supersedes', 'derived_from', 'protects'] as const;
export type EdgeKind = typeof EDGE_KINDS[number];

export const edges = sqliteTable('edges', {
	id: text('id').primaryKey(),
	kind: text('kind').notNull(),
	src_id: text('src_id').notNull(),
	dst_id: text('dst_id').notNull(),
	valid_from: text('valid_from').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
	invalidated_at: text('invalidated_at'),
	recorded_at: text('recorded_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
	// Soft FK on superseded_by → nodes.id, enforced by the DAO (Wave 2). Same rationale as nodes.
	superseded_by: text('superseded_by'),
	// Phase 16 Plan 16-01 DEEP-06 phase-A — cross-repo identity column. Symmetric with nodes.repo_id.
	// Backfills to 'primary' for all existing rows via ALTER TABLE (SQLite 3.42+ NOT NULL DEFAULT
	// semantics). Used by dao.queryByRepo (Wave 1) + Phase 17 cross-repo enumeration (phase-B).
	repo_id: text('repo_id').notNull().default('primary'),
}, (t) => [
	check('edges_kind_allowlist',
		sql`${t.kind} IN ('parent_of','references','supersedes','derived_from','protects')`),
	foreignKey({ columns: [t.src_id], foreignColumns: [nodes.id], name: 'edges_src_fk' }),
	foreignKey({ columns: [t.dst_id], foreignColumns: [nodes.id], name: 'edges_dst_fk' }),
	// Phase-3 traversal indexes — partial on (invalidated_at IS NULL) for the common active path.
	index('edges_active_src').on(t.src_id).where(sql`${t.invalidated_at} IS NULL`),
	index('edges_active_dst').on(t.dst_id).where(sql`${t.invalidated_at} IS NULL`),
]);
