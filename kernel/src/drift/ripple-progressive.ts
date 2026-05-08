/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/drift/ripple-progressive.ts — Phase 7 (Plan 07-04) DRIFT-04 + DRIFT-05 progressive
// disclosure surface.
//
// 2-phase async front-end to runRippleAnalysis for the bridge UX:
//   Phase A (synchronous inline): runRippleAnalysis(maxHops:1) → invoke onProgress callback
//                                 with the first-degree partial. The bridge can render this
//                                 immediately (typically <100ms on a 400-node fixture).
//   Phase B (deferred microtask): await Promise.resolve() to yield control, then run
//                                 runRippleAnalysis(maxHops:3) for the deeper-hops result.
//                                 Returns the merged final ComplianceReport.
//
// MERGE INVARIANT: BFS at maxHops=3 INCLUDES all nodes reachable at maxHops=1 (BFS is
// monotonic in depth). So Phase B's result is the merged final — no manual deduplication
// is needed. This keeps the ordering + dedup invariants identical to runRippleAnalysis
// and avoids subtle bugs in cross-phase merge logic.
//
// NOTIFICATION ORDERING (Plan-mandated invariant): the onProgress callback fires BEFORE
// the awaited Promise resolves. Tested in ripple-progressive.spec.ts via a flag set inside
// onProgress and asserted true synchronously after `await runRippleProgressive(...)`.

import type Database from 'better-sqlite3';
import type { GraphDAO } from '../graph/dao.js';
import { runRippleAnalysis } from './ripple.js';
import type { ComplianceReport } from './types.js';

/**
 * Input parameters for {@link runRippleProgressive}.
 *
 * @property contractNodeId The ContractNode ULID — the seed of the BFS walk.
 * @property asOf           ISO-8601 transaction time for the bitemporal traverse.
 * @property dao            GraphDAO instance.
 * @property sqlite         Raw better-sqlite3 handle.
 * @property nodeCap        Pitfall-4 cap. Forwarded to both Phase A + Phase B.
 * @property onProgress     Optional callback invoked at the end of Phase A (hopsComplete=1)
 *                          BEFORE the Phase B Promise resolves. Caller MUST treat the report
 *                          as a partial — the final return is the maxHops=3 superset.
 */
export interface RunRippleProgressiveInput {
	readonly contractNodeId: string;
	readonly asOf: string;
	readonly dao: GraphDAO;
	readonly sqlite: Database.Database;
	readonly nodeCap?: number;
	readonly onProgress?: (partial: { readonly hopsComplete: 1 | 3; readonly report: ComplianceReport }) => void;
}

/**
 * Run the ripple analyzer in 2 phases for progressive disclosure.
 *
 * Phase A is synchronous inline (runRippleAnalysis at maxHops=1) so the bridge can render
 * the first-degree report immediately; the onProgress callback fires synchronously during
 * Phase A and the partial is observable BEFORE the awaited Promise resolves.
 *
 * Phase B yields control via `await Promise.resolve()` (next microtask) so the caller's
 * UI can re-render with the partial before the deeper-hops walk begins; then runs
 * runRippleAnalysis at maxHops=3 and returns the result. The maxHops=3 walk includes
 * everything maxHops=1 reached (BFS is monotonic), so Phase B's report IS the merged final.
 *
 * @returns Promise<ComplianceReport> — the maxHops=3 final report (subsumes Phase A's
 *          partial). Caller awaits; onProgress fires BEFORE the await resolves.
 */
export async function runRippleProgressive(input: RunRippleProgressiveInput): Promise<ComplianceReport> {
	// Phase A: synchronous first-degree report. Invoke onProgress immediately.
	const phaseA = runRippleAnalysis({
		contractNodeId: input.contractNodeId,
		maxHops: 1,
		asOf: input.asOf,
		dao: input.dao,
		sqlite: input.sqlite,
		nodeCap: input.nodeCap,
	});
	if (input.onProgress) {
		input.onProgress({ hopsComplete: 1, report: phaseA });
	}

	// Phase B: yield to next microtask so the bridge's UI thread can render the partial.
	await Promise.resolve();

	// maxHops=3 BFS includes everything reachable at maxHops=1 (BFS is monotonic in depth).
	// Re-running rather than manually merging preserves the ordering + dedup invariants
	// identical to runRippleAnalysis (zero new merge code → zero new bug surface).
	const phaseB = runRippleAnalysis({
		contractNodeId: input.contractNodeId,
		maxHops: 3,
		asOf: input.asOf,
		dao: input.dao,
		sqlite: input.sqlite,
		nodeCap: input.nodeCap,
	});
	return phaseB;
}
