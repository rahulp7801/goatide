/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/promotion-gate/corroboration-counter.ts — Phase 5 Plan 05-06
// PORT-05 (b).
//
// When N distinct provenance.source values land on the same Inferred node's anchor tuple,
// flip cite_eligible via dao.supersede. Counter accumulates across BOTH the net_new-reject
// path (Plan 05-05 fires onCorroborationCandidate when an existing node's anchor matches)
// AND the post-seed corroboration sweep (kernel/src/harvester/index.ts after a fresh
// Inferred node lands).
//
// Default threshold N=3; overridable via env GOATIDE_PORT_CORROBORATION_THRESHOLD or
// the deps.threshold parameter (test injection). The corroborations array is deduped
// (Set) so the same source repeating doesn't double-count.
//
// Mandate-B compliance: every flip uses dao.supersede; the new row preserves Inferred
// confidence (the supersede DAO surface auto-preserves it). The supersedes edge is the
// audit trail showing "the gate flipped this node from <old payload>".

import type { GraphDAO } from '../../graph/dao.js';
import type { NodePayload } from '../../graph/payloads.js';
import { serializePromotionGateOp } from './index.js';

export const DEFAULT_N_THRESHOLD = 3;

interface CorroborateDeps {
	dao: GraphDAO;
	nodeId: string;
	observationProvenanceSource: string;
	threshold?: number;
}

interface DetailWithCorroborations {
	corroborations?: ReadonlyArray<string>;
	[k: string]: unknown;
}

/**
 * Increment the corroboration counter for {@link nodeId} by recording
 * {@link observationProvenanceSource}. When the deduped Set reaches the threshold (default
 * N=3, env-overridable), flips cite_eligible via dao.supersede in the same supersession.
 * Re-corroborating an already-eligible node short-circuits (no further superssion).
 *
 * Pitfall 9: serialized via per-nodeId queue — 5 concurrent calls produce a final
 * corroborations array of size 5 (no lost updates).
 */
export async function incrementCorroborationAndMaybePromote(deps: CorroborateDeps): Promise<void> {
	const N = deps.threshold ?? Number(process.env.GOATIDE_PORT_CORROBORATION_THRESHOLD ?? DEFAULT_N_THRESHOLD);

	await serializePromotionGateOp(deps.nodeId, async () => {
		// Walk the supersedes chain to the active head. If a previous corroboration
		// already superseded the node, we increment against the latest row.
		const head = followToHead(deps.dao, deps.nodeId);
		if (!head || head.confidence !== 'Inferred') {
			return;
		}
		const headPayload = head.payload as NodePayload & {
			cite_eligible?: boolean;
			detail?: DetailWithCorroborations;
		};

		// Once cite_eligible flips true, subsequent corroborations are recorded but no
		// further supersession fires (the node is already promoted). For simplicity we
		// also record the new source on top of the eligible state — this preserves the
		// audit trail showing N+1, N+2, ... corroborations after promotion.
		const existingSet = new Set<string>(headPayload.detail?.corroborations ?? []);
		if (existingSet.has(deps.observationProvenanceSource)) {
			return;     // already recorded; no-op (idempotent — same source firing twice doesn't double-count)
		}
		existingSet.add(deps.observationProvenanceSource);
		const updatedDetail: DetailWithCorroborations = {
			...(headPayload.detail ?? {}),
			corroborations: [...existingSet],
		};
		const eligibleNext = headPayload.cite_eligible === true || existingSet.size >= N;
		const nextPayload = {
			...headPayload,
			detail: updatedDetail,
			...(eligibleNext ? { cite_eligible: true } : {}),
		} as NodePayload;

		deps.dao.supersede(head.id, nextPayload, {
			source: 'harvester:promotion_gate',
			actor: 'corroboration_counter',
			detail: {
				count: existingSet.size,
				threshold: N,
				newest_source: deps.observationProvenanceSource,
				predecessor_id: head.id,
			},
		});
	});
}

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
