/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/filter/net-new.ts — Phase 5 Plan 05-05 PORT-01 predicate 2: net-new
// (exact body-hash + anchor tuple does not already exist).
//
// MANDATE-C: EXACT-tuple match only. Reuses Phase-3's deterministic anchor resolver
// (kernel/src/graph/anchor.ts via dao.queryByAnchor with $.anchor.file). Body-hash
// equality is computed in JS over the queryByAnchor result set — no SQL LIKE, no
// Levenshtein, no vector distance. The CI gate scripts/ci/refuse-fuzzy-fallback.sh
// catches any drift; this module's contract is the structural backstop.
//
// PORT-05(b) corroboration trigger: when a net_new rejection fires AND the matching
// existing node is Inferred, we dispatch ctx.onCorroborationCandidate(existingNodeId,
// observation.source). Plan 05-06 wires the implementation behind this callback (the
// promotion-gate's "Inferred -> Confirmed after N corroborations" rule).

import { computeAnchorTuple } from './anchor-tuple.js';
import type { RawObservation } from '../observations.js';
import type { FilterContext } from './index.js';
import type { NodeRow } from '../../graph/dao.js';
import { createHash } from 'node:crypto';

/**
 * Predicate 2 of 5. Async because dao.queryByAnchor is synchronous but the corroboration
 * callback is async (Plan 05-06 may write back to the graph).
 */
export async function isNetNew(obs: RawObservation, ctx: FilterContext): Promise<{ ok: boolean; reason?: string }> {
	const tuple = computeAnchorTuple(obs);
	if (!tuple.file_path) {
		// No anchor key (e.g. git_commit without per-file mapping in v1) — accept.
		// Phase 7 may populate symbol-level anchors that re-engage net-new dedup.
		return { ok: true };
	}

	const asOf = new Date(ctx.now()).toISOString();
	const candidates: readonly NodeRow[] = ctx.dao.queryByAnchor(
		{ jsonPath: '$.anchor.file', value: tuple.file_path },
		asOf,
	);

	for (const candidate of candidates) {
		const candidateBody = (candidate.payload as { body?: unknown }).body;
		if (typeof candidateBody !== 'string') {
			continue;
		}
		const candidateHash = createHash('sha256').update(candidateBody).digest('hex');
		if (candidateHash === tuple.body_hash) {
			// PORT-05(b) corroboration trigger. Fire-and-forget: net_new rejection itself
			// does not block on the promotion-gate's bookkeeping. Plan 05-06 wires the
			// implementation; until then, ctx.onCorroborationCandidate is undefined and
			// this branch is a no-op.
			if (ctx.onCorroborationCandidate) {
				await ctx.onCorroborationCandidate(candidate.id, obs.source);
			}
			return { ok: false, reason: `exact-anchor-tuple match exists (node=${candidate.id})` };
		}
	}
	return { ok: true };
}
