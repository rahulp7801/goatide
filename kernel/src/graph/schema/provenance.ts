// kernel/src/graph/schema/provenance.ts — Phase 2 (Plan 02-02) sibling table for provenance.
//
// Per GRAPH-05: every node carries an immutable provenance record (source, actor, when, detail).
// `recorded_at` is immutable via the same BEFORE-UPDATE-OF trigger pattern; the entire row is
// also append-only via the BEFORE-DELETE trigger AND a BEFORE-UPDATE trigger that blocks ALL
// column updates (since provenance is fully immutable, not just bitemporal).
//
// Reference: 02-RESEARCH.md ## Pattern: Provenance as a Sibling Table.

import { sql } from 'drizzle-orm';
import { sqliteTable, text, foreignKey } from 'drizzle-orm/sqlite-core';
import { nodes } from './nodes';

export const provenance = sqliteTable('provenance', {
	node_id: text('node_id').primaryKey(),
	source: text('source').notNull(),                // 'cli' | 'harvester:claude_jsonl' | 'mcp:slack' | ...
	actor: text('actor').notNull(),
	recorded_at: text('recorded_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
	detail: text('detail', { mode: 'json' }).$type<Record<string, unknown> | null>(),
}, (t) => [
	foreignKey({ columns: [t.node_id], foreignColumns: [nodes.id], name: 'provenance_node_fk' }),
]);
