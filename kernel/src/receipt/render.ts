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
//
// Phase 7 Plan 07-05 (DRIFT-02) — additive optional sessionPriority parameter. When the
// caller supplies sessionPriority, evaluateIntentDrift runs after the citation hydration
// loop and decorates each RenderedCitation with intent_drift_badge (badge for mismatching
// DecisionNode citations; null otherwise). When sessionPriority is omitted the existing
// (Phase 3..6) behavior is preserved exactly — intent_drift_badge stays undefined.

import type { GraphDAO, NodePayload } from '../graph/index.js';
import type { Citation } from './citation.js';
import type { ReasoningReceipt } from './builder.js';
import { evaluateIntentDrift, evaluateHistoricalConflict } from '../drift/intent.js';
import type { IntentDriftBadge } from '../drift/types.js';

export interface RenderedCitation extends Citation {
	cited_payload: NodePayload | null;
	cited_invalidated_at: string | null;
	successor_id: string | null;
	/**
	 * Phase 7 Plan 07-05 (DRIFT-02): populated when renderReceipt was called with a
	 * sessionPriority and this citation's cited DecisionNode mismatches it. Null on
	 * matching DecisionNode citations or when sessionPriority was provided but the
	 * citation isn't a DecisionNode / lacks derived_under_priority. Undefined when
	 * sessionPriority was not provided (preserves Phase 3..6 wire shape exactly).
	 */
	intent_drift_badge?: IntentDriftBadge | null;
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
 * Phase 7 Plan 07-05: optional render-time options. When sessionPriority is provided,
 * evaluateIntentDrift runs against the rendered receipt and decorates matching citations.
 */
export interface RenderReceiptOptions {
	/** Active session priority (e.g. 'Quality-First'). When set, IntentDrift is evaluated. */
	sessionPriority?: string;
}

/**
 * Render a receipt by augmenting each citation with the cited row's payload + supersession status.
 *
 * REC-03: The receipt's citations remain stable across supersessions — `cited_payload` is the
 * exact version cited at compose time. If the cited row has since been superseded,
 * `cited_invalidated_at` is non-null and `successor_id` points to the new head (for the
 * "superseded by ->" badge).
 *
 * Plan 07-05 extension: when options.sessionPriority is provided, evaluateIntentDrift runs
 * after the hydration loop and decorates each RenderedCitation with intent_drift_badge
 * (or null when the citation is matching / non-DecisionNode / unannotated). Existing
 * Phase 3..6 callers that omit options behave identically to the pre-Plan-07-05 surface.
 */
export function renderReceipt(receipt: ReasoningReceipt, dao: GraphDAO, options?: RenderReceiptOptions): RenderedReceipt {
	const citations: RenderedCitation[] = receipt.citations.map((c) => {
		const cited = dao.queryById(c.node_id);
		const successor = dao.findSuccessor(c.node_id);
		return {
			...c,
			cited_payload: cited ? cited.payload : null,
			cited_invalidated_at: cited ? cited.invalidated_at : null,
			successor_id: successor ? successor.id : null,
		};
	});

	const rendered: RenderedReceipt = {
		...receipt,
		citations,
	};

	// Plan 14-03 (DEEP-04): unconditionally evaluate historical-conflict. The evaluator
	// fires regardless of session priority — DEEP-04 is independent of priority (open question
	// #4 default). Each cited DecisionNode whose row was superseded on or before the
	// receipt's graph_snapshot_tx_time gets a `historical-conflict` IntentDriftBadge.
	const historicalBadges = evaluateHistoricalConflict({
		renderedReceipt: rendered,
		asOf: receipt.graph_snapshot_tx_time,
	});
	const historicalByCitationId = new Map<string, IntentDriftBadge>();
	for (const badge of historicalBadges) {
		historicalByCitationId.set(badge.citation_node_id, badge);
	}

	// Plan 07-05 (DRIFT-02): decorate citations with intent_drift_badge when sessionPriority is set.
	// When sessionPriority is undefined, the priority-mismatch evaluator is skipped (Phase 3..6
	// wire shape preserved for priority-mismatch). Historical-conflict still fires above —
	// the field becomes present (badge or null) once either evaluator runs.
	const priorityByCitationId = new Map<string, IntentDriftBadge>();
	if (options?.sessionPriority !== undefined) {
		const priorityBadges = evaluateIntentDrift({
			renderedReceipt: rendered,
			sessionPriority: options.sessionPriority,
		});
		for (const badge of priorityBadges) {
			priorityByCitationId.set(badge.citation_node_id, badge);
		}
	}

	// Attach badges. Historical-conflict takes precedence over priority-mismatch when both
	// fire on the same citation (the row was actually superseded — strongest signal). When
	// neither evaluator emitted a badge but at least one ran, the field is null. When
	// sessionPriority was omitted AND no historical-conflict badges were emitted, the field
	// stays undefined to preserve the pre-Plan-07-05 wire shape for legacy callers.
	const anyEvaluatorRan = options?.sessionPriority !== undefined || historicalBadges.length > 0;
	if (anyEvaluatorRan) {
		for (const citation of rendered.citations) {
			const historical = historicalByCitationId.get(citation.node_id);
			if (historical !== undefined) {
				citation.intent_drift_badge = historical;
				continue;
			}
			if (options?.sessionPriority !== undefined) {
				const priority = priorityByCitationId.get(citation.node_id);
				citation.intent_drift_badge = priority ?? null;
			}
		}
	}

	return rendered;
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
