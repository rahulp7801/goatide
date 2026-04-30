/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/receipt/render.ts — Phase 3 (Plan 03-03) snapshot-stable receipt renderer.
//
// Per 03-RESEARCH.md ## Pattern: Snapshot-Stable Render. The cited row is fetched by exact
// ULID via queryById (Phase-2 invariant: rows are never deleted, supersession only sets
// invalidated_at). Successor walked via findSuccessor for the "superseded by ->" badge.
// Provenance read via queryProvenance for REC-06 drill-down.
//
// Why queryById and NOT queryAsOf:
//   A citation references a specific row's ULID. That row is never deleted (Phase-2
//   invariant: append-only, supersession-only). queryById always finds it regardless of
//   asOf. The bitemporal graph_snapshot_tx_time field on the receipt provides the audit
//   trail; the renderer's job is augmentation, not re-resolution.

import type { GraphDAO, NodePayload } from '../graph/index.js';
import type { Citation } from './citation.js';
import type { ReasoningReceipt } from './builder.js';

export interface RenderedCitation extends Citation {
	cited_payload: NodePayload | null;
	cited_invalidated_at: string | null;
	successor_id: string | null;
}

export interface RenderedReceipt extends Omit<ReasoningReceipt, 'citations'> {
	citations: RenderedCitation[];
}

export interface ProvenanceTrail {
	node_id: string;
	source: string;
	actor: string;
	recorded_at: string;
	detail: Record<string, unknown> | null;
}

/**
 * Render a receipt by augmenting each citation with the cited row's payload + supersession status.
 *
 * REC-03: The receipt's citations remain stable across supersessions — `cited_payload` is the
 * exact version cited at compose time. If the cited row has since been superseded,
 * `cited_invalidated_at` is non-null and `successor_id` points to the new head (for the
 * "superseded by ->" badge).
 */
export function renderReceipt(receipt: ReasoningReceipt, dao: GraphDAO): RenderedReceipt {
	return {
		...receipt,
		citations: receipt.citations.map((c) => {
			const cited = dao.queryById(c.node_id);
			const successor = dao.findSuccessor(c.node_id);
			return {
				...c,
				cited_payload: cited ? cited.payload : null,
				cited_invalidated_at: cited ? cited.invalidated_at : null,
				successor_id: successor ? successor.id : null,
			};
		}),
	};
}

/**
 * REC-06: Drill back to the originating provenance record for a single citation.
 * Returns null if the citation's node_id has no provenance row (defensive — every node
 * seeded via GraphDAO.seed has provenance, so production never hits null).
 */
export function explainCitation(citation: Citation, dao: GraphDAO): ProvenanceTrail | null {
	const prov = dao.queryProvenance(citation.node_id);
	if (!prov) {
		return null;
	}
	return {
		node_id: prov.node_id,
		source: prov.source,
		actor: prov.actor,
		recorded_at: prov.recorded_at,
		detail: prov.detail,
	};
}
