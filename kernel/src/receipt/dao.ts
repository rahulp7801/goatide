/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/receipt/dao.ts — Phase 3 (Plan 03-03) receipt persistence.
//
// Receipts are append-only by application convention (no triggers, no immutability check
// at the storage layer). This DAO offers write + read; no update, no delete. Phase 4
// (Verification Canvas) is the only writer in production; Phase 3 tests + Plan 03-04 RPC
// also write through here.
//
// Why a separate DAO (not bolted onto GraphDAO):
//   - GraphDAO is the ONLY mutation surface above raw better-sqlite3 for nodes/edges/
//     provenance — the bitemporal trio. Adding receipts there blurs the boundary.
//   - Receipts are NOT bitemporal nodes (they reference nodes, they aren't nodes); they
//     get a different lifecycle (append-only by convention, no triggers). Separate DAO
//     == separate semantic boundary.

import { eq } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { receipts } from '../graph/schema/receipts.js';
import type { Citation } from './citation.js';
import type { ReasoningReceipt } from './builder.js';

export class ReceiptDAO {
	constructor(private readonly db: BetterSQLite3Database) { }

	/** Insert a receipt. Throws if the id already exists (PK conflict). */
	write(receipt: ReasoningReceipt): void {
		this.db.insert(receipts).values({
			id: receipt.id,
			change_id: receipt.change_id,
			citations: receipt.citations,
			drill_chain: receipt.drill_chain,
			destructive: receipt.destructive,
			graph_snapshot_tx_time: receipt.graph_snapshot_tx_time,
		}).run();
	}

	/** Read a receipt by ULID. Returns null if not found. */
	read(id: string): ReasoningReceipt | null {
		const row = this.db.select().from(receipts).where(eq(receipts.id, id)).get();
		if (!row) {
			return null;
		}
		return {
			id: row.id,
			change_id: row.change_id,
			citations: row.citations as Citation[],
			drill_chain: row.drill_chain as string[],
			destructive: row.destructive,
			graph_snapshot_tx_time: row.graph_snapshot_tx_time,
		};
	}
}
