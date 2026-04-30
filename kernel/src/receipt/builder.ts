/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/receipt/builder.ts — Phase 3 (Plan 03-03) ReasoningReceipt composer.
//
// Per 03-RESEARCH.md ## Pattern: Receipt Builder. Single shared `asOf` per receipt
// (REC-03 — Open Question #3). REC-04 destructive guard on every-Inferred citations.
// REC-05 cite_eligible filter (Phase-3 default; Phase-4 owns real promotion).
//
// Pitfalls applied:
//   - Pitfall 6: destructive guard checks citations.length > 0 BEFORE .every — empty-citation
//     destructive change passes (vacuous-truth false-positive avoided).
//   - Pitfall 10: jsdiff.parsePatch ALWAYS returns Array<ParsedDiff>. We .flatMap over it.
//   - Pitfall 5: passing input.asOf to BOTH resolveAnchor AND traverse — single snapshot.

import { parsePatch } from 'diff';
import { ulid } from 'ulid';
import type Database from 'better-sqlite3';
import { resolveAnchor, traverse, type AnchorRequest, type GraphDAO } from '../graph/index.js';
import type { Citation } from './citation.js';
import type { ReceiptDAO } from './dao.js';

export interface BuildReceiptInput {
	diff: string;             // unified diff string from bridge's onWillSaveTextDocument (Phase 4)
	destructive: boolean;     // pre-classified by caller (Phase 4 brings the classifier)
	asOf: string;             // ISO-8601 — captured at compose time, becomes graph_snapshot_tx_time
}

export interface ReasoningReceipt {
	id: string;                            // ULID (26 chars)
	change_id: string;                     // ULID; one receipt per proposed change (REC-01)
	citations: Citation[];
	drill_chain: string[];                 // edge_path strings from traverse result
	destructive: boolean;
	graph_snapshot_tx_time: string;        // REC-03 — ISO-8601 ms precision
}

/** Thrown when a destructive change cites only Inferred (unpromoted) nodes — REC-04. */
export class ReceiptRefusalError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ReceiptRefusalError';
	}
}

/**
 * Compose a ReasoningReceipt for a proposed change.
 *
 * Caller passes (dao, receiptDao, sqlite) because traverse requires the raw better-sqlite3
 * handle and the ReceiptDAO writes through drizzle. All three are constructed by the kernel
 * boot path (Plan 03-04) or by tests.
 *
 * The single `input.asOf` is reused for both the anchor resolution and the traversal step
 * AND persisted as graph_snapshot_tx_time. This is the REC-03 single-snapshot invariant —
 * a supersession landing during compose cannot make the receipt reference rows that didn't
 * exist at the persisted snapshot.
 */
export function buildReceipt(
	input: BuildReceiptInput,
	dao: GraphDAO,
	receiptDao: ReceiptDAO,
	sqlite: Database.Database,
): ReasoningReceipt {
	// Parse diff. parsePatch returns Array<ParsedDiff> always (Pitfall 10).
	const patches = parsePatch(input.diff);

	// Build AnchorRequest[] from the union of newFileName / oldFileName, deduplicated.
	const files = new Set<string>();
	for (const p of patches) {
		const name = stripGitPrefix(p.newFileName ?? p.oldFileName ?? '');
		if (name) {
			files.add(name);
		}
	}
	const anchorRequests: AnchorRequest[] = Array.from(files).map((path) => ({ kind: 'file', path }));

	// Resolve anchors at the SAME asOf used everywhere downstream.
	const seedNodes = anchorRequests.flatMap((a) => resolveAnchor(dao, a, input.asOf));
	const uniqueSeedIds = Array.from(new Set(seedNodes.map((n) => n.id)));

	// Traverse — empty seed -> empty traversal (TRAV-06; receipt still composed per REC-01).
	const traversal = traverse(sqlite, {
		anchorIds: uniqueSeedIds,
		scope: 'all',
		max_hops: 4,
		at: input.asOf,
	});

	// REC-05 filter: cite_eligible (default-true except when explicitly false on Inferred).
	const eligibleNodes = traversal.nodes.filter(isCiteEligible);

	const citations: Citation[] = eligibleNodes.map((n) => ({
		node_id: n.node_id,
		version: n.node_id,
		confidence: n.confidence,
		edge_path: n.edge_path,
		snippet: ((n.payload as { body?: string }).body ?? '').slice(0, 280),
	}));

	// REC-04 destructive guard. Pitfall 6 — length > 0 BEFORE .every (vacuous-truth fix).
	if (input.destructive && citations.length > 0 && citations.every((c) => c.confidence === 'Inferred')) {
		throw new ReceiptRefusalError(
			'REC-04: destructive change cited only by Inferred nodes; promote one to Explicit before submitting.'
		);
	}

	const receipt: ReasoningReceipt = {
		id: ulid(),
		change_id: ulid(),
		citations,
		drill_chain: traversal.paths,
		destructive: input.destructive,
		graph_snapshot_tx_time: input.asOf,
	};
	receiptDao.write(receipt);
	return receipt;
}

/**
 * REC-05 cite-eligibility check. Phase 3 default policy:
 *   - Explicit nodes: always cite-eligible.
 *   - Inferred nodes: cite-eligible UNLESS payload.cite_eligible === false (explicit opt-out).
 *
 * Phase 4 (Canvas-decision promotion) and Phase 5 (corroboration counter) own the real
 * gate — at that point the payload.cite_eligible flag is set true upon promotion.
 */
function isCiteEligible(n: { confidence: 'Explicit' | 'Inferred'; payload: unknown }): boolean {
	if (n.confidence === 'Explicit') {
		return true;
	}
	const flag = (n.payload as { cite_eligible?: boolean })?.cite_eligible;
	return flag !== false;  // default-true for Inferred at Phase-3 stage
}

function stripGitPrefix(name: string): string {
	if (name.startsWith('a/') || name.startsWith('b/')) {
		return name.slice(2);
	}
	return name;
}
