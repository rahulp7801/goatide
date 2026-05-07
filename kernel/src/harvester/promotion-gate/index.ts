/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/promotion-gate/index.ts — Phase 5 Plan 05-06 PORT-05.
//
// Promotion-gate orchestrator. Two paths flip cite_eligible on an Inferred node:
//   (a) canvas-decision-listener.ts — Phase-4 Canvas Accept on an Attempt referencing
//       the Inferred node. Triggered synchronously inside the atomicAccept RPC handler.
//   (b) corroboration-counter.ts — when 3 distinct provenance.source values land on the
//       same anchor tuple, threshold-promote. Triggered via the
//       FilterContext.onCorroborationCandidate callback that Plan 05-05 dispatches on
//       net_new rejection AND from the post-seed corroboration sweep in submitRawObservation.
//
// Pitfall 9 (concurrent observations race the corroboration counter): all promotion-gate
// operations against the same nodeId serialize through a per-node async queue (a
// Map<string, Promise<void>> chained-promise). Concurrent calls on the same nodeId block
// on the previous one's resolve before reading current state — no lost updates.

const promotionGateQueues = new Map<string, Promise<void>>();

/**
 * Serialize an op against a single nodeId. Concurrent calls with the same nodeId chain
 * onto the previous promise; concurrent calls against DIFFERENT nodeIds run in parallel.
 *
 * The queues map is automatically cleaned up after the chain head resolves so memory
 * doesn't grow unbounded across unrelated promotions.
 */
export async function serializePromotionGateOp(nodeId: string, op: () => Promise<void>): Promise<void> {
	const prev = promotionGateQueues.get(nodeId) ?? Promise.resolve();
	const next = prev.then(op, op);  // run op on both fulfilled + rejected — never block subsequent ops on prior errors
	const tail = next.finally(() => {
		if (promotionGateQueues.get(nodeId) === tail) {
			promotionGateQueues.delete(nodeId);
		}
	});
	promotionGateQueues.set(nodeId, tail);
	return next;
}

export { flipCiteEligibleOnAcceptedReceipt } from './canvas-decision-listener.js';
export { incrementCorroborationAndMaybePromote, DEFAULT_N_THRESHOLD } from './corroboration-counter.js';
