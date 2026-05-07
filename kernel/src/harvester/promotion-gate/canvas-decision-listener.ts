/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/promotion-gate/canvas-decision-listener.ts — Phase 5 Plan 05-06
// PORT-05 (a).
//
// When a Phase-4 Canvas Accept lands on an Attempt(attempt_kind='accepted') whose first
// 'references' edge points to an Inferred node, this listener flips that node's
// cite_eligible flag via dao.supersede (Mandate-B compliance: supersession + supersedes
// edge audit trail, NEVER an in-place UPDATE).
//
// Idempotent: if the referenced node is already cite_eligible (or was never Inferred),
// no-op. The serializePromotionGateOp queue (kernel/src/harvester/promotion-gate/index.ts)
// guards against the same nodeId being flipped by a concurrent corroboration counter.

import type { GraphDAO } from '../../graph/dao.js';
import type { NodePayload } from '../../graph/payloads.js';
import { serializePromotionGateOp } from './index.js';

interface FlipDeps {
	dao: GraphDAO;
	attemptId: string;
}

/**
 * Walk the attempt's 'references' edges; for each Inferred citation, flip cite_eligible
 * via supersession. Returns the number of flips performed (zero when the attempt was
 * not 'accepted' or all citations were already cite-eligible / not Inferred).
 */
export async function flipCiteEligibleOnAcceptedReceipt(deps: FlipDeps): Promise<number> {
	const attempt = deps.dao.queryById(deps.attemptId);
	if (!attempt || attempt.kind !== 'Attempt') {
		return 0;
	}
	const attemptPayload = attempt.payload as { attempt_kind?: string };
	if (attemptPayload.attempt_kind !== 'accepted') {
		return 0;
	}

	const refs = deps.dao.queryReferencesEdges(deps.attemptId);
	let flips = 0;
	for (const dstId of refs) {
		await serializePromotionGateOp(dstId, async () => {
			// Re-read inside the queue to avoid stale snapshot. Active head is what we
			// supersede — if a concurrent corroboration counter already promoted, we
			// follow the supersedes chain to the head and only flip if still Inferred + not eligible.
			const head = followToHead(deps.dao, dstId);
			if (!head || head.confidence !== 'Inferred') {
				return;
			}
			const headPayload = head.payload as NodePayload & { cite_eligible?: boolean };
			if (headPayload.cite_eligible === true) {
				return;
			}
			const nextPayload = { ...headPayload, cite_eligible: true } as NodePayload;
			deps.dao.supersede(head.id, nextPayload, {
				source: 'harvester:promotion_gate',
				actor: 'canvas_decision_listener',
				detail: { attempt_id: deps.attemptId, predecessor_id: head.id },
			});
			flips += 1;
		});
	}
	return flips;
}

/**
 * Follow the supersedes chain from {@link nodeId} forward until findSuccessor returns
 * null. The returned NodeRow is the active head (or null if nodeId itself doesn't exist).
 */
function followToHead(dao: GraphDAO, nodeId: string) {
	let current = dao.queryById(nodeId);
	if (!current) {
		return null;
	}
	let next = dao.findSuccessor(current.id);
	while (next) {
		current = next;
		next = dao.findSuccessor(current.id);
	}
	return current;
}
