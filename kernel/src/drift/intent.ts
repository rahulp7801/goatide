/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/drift/intent.ts — Phase 7 (Plan 07-05) DRIFT-02 IntentDrift evaluator.
//
// Pure-function evaluator: NO IO, NO async, NO DAO calls. The cited DecisionNode payloads
// are already attached to RenderedCitation by Plan 03-03's renderReceipt hydration step.
// This module only inspects the in-memory RenderedReceipt and emits IntentDriftBadge[].
//
// Mandate-C exact-equality (Pitfall 5 in 07-RESEARCH.md): the comparison is `===`. A user
// session priority of 'Quality' does NOT match a cited derived_under_priority of
// 'Quality-First'. The unit-test suite pins this — kernel/src/test/drift/intent.spec.ts
// includes a test case that fires a badge in this exact prefix-not-exact-match scenario,
// rejecting any future refactor that silently introduces prefix-match.
//
// DecisionNode-only by design: derived_under_priority is a field declared ONLY on
// DecisionPayload (kernel/src/graph/payloads.ts). Citations whose cited_payload.kind is
// anything else (ContractNode, ConstraintNode, OpenQuestion, Attempt) skip the comparison
// entirely. Citations with null cited_payload (defensive — supersession edge case) skip too.

import type { RenderedReceipt } from '../receipt/render.js';
import type { IntentDriftBadge } from './types.js';

export type { IntentDriftBadge } from './types.js';

export interface EvaluateIntentDriftInput {
	readonly renderedReceipt: RenderedReceipt;
	readonly sessionPriority: string;
}

/**
 * Compare each cited DecisionNode's derived_under_priority to the session priority.
 * Emit one IntentDriftBadge per mismatch. Citations without derived_under_priority,
 * non-DecisionNode citations, and citations with null cited_payload are skipped.
 *
 * Pure function — same inputs always produce byte-for-byte identical output.
 */
export function evaluateIntentDrift(input: EvaluateIntentDriftInput): IntentDriftBadge[] {
	const badges: IntentDriftBadge[] = [];
	for (const citation of input.renderedReceipt.citations) {
		const payload = citation.cited_payload;
		if (!payload) {
			continue;
		}
		if (payload.kind !== 'DecisionNode') {
			continue;
		}
		const derived = payload.derived_under_priority;
		if (derived === undefined) {
			continue;
		}
		// Mandate-C exact-equality. Pitfall 5: 'Quality' !== 'Quality-First' fires a badge.
		// DO NOT introduce prefix-match here — the unit-test suite will reject it.
		if (derived === input.sessionPriority) {
			continue;
		}
		badges.push({
			citation_node_id: citation.node_id,
			session_priority: input.sessionPriority,
			cited_priority: derived,
			explanation: `This rule was derived under '${derived}'; current session is '${input.sessionPriority}'. Re-evaluate before applying.`,
		});
	}
	return badges;
}
