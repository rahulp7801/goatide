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
// Plan 03-03: the `Citation` type is now sourced from kernel/src/receipt/citation.ts
// (the canonical Zod-validated citation tuple). receipts.ts is the storage-shape file;
// citation.ts is the validation-shape file. One-way edge: receipt/* imports from graph/*
// (for NodePayload, GraphDAO types), but graph/schema/receipts.ts imports a TYPE-ONLY
// reference from receipt/citation.ts — no runtime cycle.

import { sql } from 'drizzle-orm';
import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';
import type { Citation } from '../../receipt/citation.js';

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
