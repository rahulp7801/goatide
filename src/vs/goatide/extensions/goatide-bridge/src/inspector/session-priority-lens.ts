/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/inspector/session-priority-lens.ts —
// Phase 14 Plan 14-04 (DEEP-05) — pure in-memory rerank of citations by drift-bearing badge.
//
// Mandate B (DEEP-05): the lens MUST NOT mutate kernel state. The `_client` parameter is
// typed as ReadonlyKernelClient — that type's surface is fenced by
// scripts/ci/refuse-deep05-write.sh against the four banned write-RPC method names (see
// the gate script for the canonical token list). The `_client` argument is reserved for
// future read-only enrichment; v1 does not consult it.
//
// Mandate B fence: function body MUST NOT exceed 10 lines. If you need more logic, you are
// violating the lens's purity contract. The function is a pure in-memory sort + indicator
// string construction — no kernel touch, no async, no IO.

import type { ReadonlyKernelClient } from './ReadonlyKernelClient.js';
import type { RenderedCitationForCanvas, DriftFindingForCanvas } from '../canvas/messages.js';

/**
 * Rerank the citations on a CanvasShowPayload by drift-bearing badge, preserving tie
 * stability. Returns a NEW citations array (Mandate B: the input is not mutated). The
 * header indicator string is emitted unconditionally — Plan 14-04 Task 2 wires it into the
 * Canvas header element keyed on `data-testid="canvas-header-session-priority"`.
 *
 * Sort rule: `intent_drift_badge != null` means drift-bearing — sort to front. Both variants of
 * the discriminated union (`priority-mismatch` from Plan 07-05, `historical-conflict` from
 * Plan 14-03) are treated equivalently. Uses `Array.prototype.sort` (V8/Node 22+ stable
 * sort) — ties preserve original receipt order. Findings pass through verbatim in v1
 * (open question #2 default: only citations re-rank).
 *
 * @param args.citations         — readonly citation array from the rendered receipt.
 * @param args.findings          — readonly drift findings (passed through unchanged in v1).
 * @param args.sessionPriority   — current session priority (e.g. 'Speed-First').
 * @param args._client           — optional read-only kernel client; reserved for future use.
 *
 * @returns `citations` (reranked, new array), `findings` (untouched), `indicator` string.
 */
export function rerankBySessionPriority(args: {
	readonly citations: readonly RenderedCitationForCanvas[];
	readonly findings: readonly DriftFindingForCanvas[];
	readonly sessionPriority: string;
	readonly _client?: ReadonlyKernelClient;
}): {
	readonly citations: readonly RenderedCitationForCanvas[];
	readonly findings: readonly DriftFindingForCanvas[];
	readonly indicator: string;
} {
	const sorted = [...args.citations].sort((a, b) => {
		const aDrift = a.intent_drift_badge ? 1 : 0;
		const bDrift = b.intent_drift_badge ? 1 : 0;
		return bDrift - aDrift;
	});
	return {
		citations: sorted,
		findings: args.findings,
		indicator: `Filtered by session priority: ${args.sessionPriority}`,
	};
}
