/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/graph/schema/receipts.ts — Phase 3 (Plan 03-01) receipts table.
//
// Per 03-RESEARCH.md ## Pattern: ReasoningReceipt Data Model. Receipts are the
// snapshot-stable citation envelope for every proposed change (REC-01..03).
// Append-only by application convention — no triggers needed at the storage layer;
// the bitemporal-substrate triggers only protect nodes/edges/provenance.
//
// Plan-03-01 Wave-0 carryover: the `Citation` type is a local placeholder until Plan
// 03-03 lands `kernel/src/receipt/citation.ts`. Plan 03-03 must replace the local
// alias with `import type { Citation } from '../../receipt/citation.js'`.

import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

// Local placeholder until Plan 03-03 lands kernel/src/receipt/citation.ts. See header.
type Citation = {
	node_id: string;
	version: string;
	confidence: 'Explicit' | 'Inferred';
	edge_path: string;
	snippet: string;
};

export const receipts = sqliteTable('receipts', {
	id: text('id').primaryKey(),                                                // ULID
	change_id: text('change_id').notNull(),                                     // ULID; one receipt per proposed change (REC-01)
	citations: text('citations', { mode: 'json' }).notNull().$type<Citation[]>(),
	drill_chain: text('drill_chain', { mode: 'json' }).notNull().$type<string[]>(),
	destructive: integer('destructive', { mode: 'boolean' }).notNull(),         // REC-01
	graph_snapshot_tx_time: text('graph_snapshot_tx_time').notNull(),           // REC-03 — ISO-8601 ms precision
	recorded_at: text('recorded_at').notNull().default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
}, (t) => [
	index('receipts_change_id').on(t.change_id),
]);
