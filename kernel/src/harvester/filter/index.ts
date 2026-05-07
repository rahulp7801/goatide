/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/filter/index.ts — Phase 5 Plan 05-05 deterministic 6-gate cascade.
//
// runFilter is the single dispatch surface for the Portability Filter. The cascade is
// FIXED in this order:
//   1. credential_scrub (Pitfall-8 defense-in-depth — runs FIRST, before any LLM sees data)
//   2. portable           (machine-specific paths, ephemeral IDs)
//   3. net_new            (exact-tuple dedup; corroborates existing nodes on hit)
//   4. project_relevant   (workspace-folder prefix scope)
//   5. verifiable         (unfalsifiable opinion shapes)
//   6. justified          (per-source rationale heuristics)
//
// AND-chain semantics: short-circuits on the first false. PORT-02 silent rejection: this
// module's caller (kernel/src/harvester/index.ts submitRawObservation) appends a
// rejected-log entry but DOES NOT call dao.seed and DOES NOT post any bridge event.
//
// Mandate-C: every predicate uses exact regex / prefix / sha256 / SQL equality. There is
// NO vector / similarity / fuzzy code anywhere in the cascade — refuse-fuzzy-fallback.sh
// is the structural backstop.

import type { RawObservation } from '../observations.js';
import type { GraphDAO } from '../../graph/dao.js';
import type { ObservationSource } from '../observations.js';
import { scrubForCredentials } from './credential-scrub.js';
import { isPortable } from './portable.js';
import { isNetNew } from './net-new.js';
import { isProjectRelevant } from './project-relevant.js';
import { isVerifiable } from './verifiable.js';
import { isJustified } from './justified.js';

/** Predicate identifier. Used in FilterDecision.predicate and in rejected-log records. */
export type Predicate =
	| 'credential_scrub'
	| 'portable'
	| 'net_new'
	| 'project_relevant'
	| 'verifiable'
	| 'justified';

/**
 * Filter pipeline context. Predicates receive this on every call; ctx.dao provides the
 * exact-equality query surface (Phase-3 deterministic anchor resolver), ctx.workspaceFolders
 * is the prefix-match scope, ctx.now is injectable for tests, ctx.onCorroborationCandidate
 * is dispatched on net_new rejection (Plan 05-06 wires the implementation).
 */
export interface FilterContext {
	dao: GraphDAO;
	workspaceFolders: readonly string[];
	now: () => number;
	onCorroborationCandidate?: (existingNodeId: string, observationSource: ObservationSource) => Promise<void>;
}

/** runFilter discriminated-union return. Caller branches on `kind` for accept-vs-reject. */
export type FilterDecision =
	| { kind: 'accept' }
	| { kind: 'reject'; predicate: Predicate; reason: string };

type PredicateFn = (
	obs: RawObservation,
	ctx: FilterContext,
) => Promise<{ ok: boolean; reason?: string }> | { ok: boolean; reason?: string };

/**
 * Cascade order is exported so tests can verify the contract structurally
 * (any reordering / removal would break the pin in pipeline.spec.ts).
 */
export const PREDICATES: readonly { name: Predicate; fn: PredicateFn }[] = [
	{ name: 'credential_scrub', fn: (obs) => scrubForCredentials(obs) },
	{ name: 'portable', fn: isPortable },
	{ name: 'net_new', fn: isNetNew },
	{ name: 'project_relevant', fn: isProjectRelevant },
	{ name: 'verifiable', fn: isVerifiable },
	{ name: 'justified', fn: isJustified },
];

/**
 * Run the 6-gate cascade. Returns immediately on the first failed predicate. Caller
 * (submitRawObservation) is responsible for the rejected-log append on the reject side
 * AND for skipping dao.seed / bridge-event-emit on the reject side (PORT-02).
 */
export async function runFilter(
	obs: RawObservation,
	ctx: FilterContext,
): Promise<FilterDecision> {
	for (const { name, fn } of PREDICATES) {
		const result = await fn(obs, ctx);
		if (!result.ok) {
			return { kind: 'reject', predicate: name, reason: result.reason ?? `failed predicate: ${name}` };
		}
	}
	return { kind: 'accept' };
}
