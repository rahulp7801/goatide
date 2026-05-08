/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/drift/registry.ts — Phase 7 (Plan 07-02) DRIFT-01 contract registry loader.
//
// Single read-only snapshot of all active ContractNodes at a given asOf timestamp. Plan
// 07-07 (bridge save-gate) calls loadContractRegistry once per save dispatch — the registry
// is then handed to runDriftDetector + detectsContractLock + runRippleAnalyzer in
// dependency order without re-querying the DAO.
//
// Pitfall 1 (07-RESEARCH.md): graceful degradation. The registry MUST NOT throw on a
// malformed payload — instead log + skip + continue. A single bad ContractNode cannot
// break the per-save dispatch for the other 99 contracts. Mandate-C still applies inside
// each pattern evaluator (exact-equality only).
//
// Pitfall 8 (07-RESEARCH.md): we do NOT add new top-level fields to ContractPayload here.
// Future fields belong in detail passthrough; the registry only consumes patterns +
// enforcing_sections + contract_path which are already on the schema (Plan 07-01).

import type { GraphDAO } from '../graph/index.js';
import { ContractPayload } from '../graph/payloads.js';
import type { ContractRegistry, ContractNodeRecord, PatternEntry } from './types.js';

/**
 * Load the per-save snapshot of all active ContractNodes at a given asOf transaction time.
 *
 * Async signature is preserved for future-proofing (the v1 implementation is synchronous —
 * GraphDAO.queryByKind is sync — but Plan 07-07 will likely add fan-out caching that is
 * async, so callers already await the result).
 *
 * Skip rules:
 *   - ContractNode whose payload fails ContractPayload.safeParse → log + skip entirely.
 *   - ContractNode without contract_path → registered in byId only (not byPath); logged.
 *   - ContractNode without payload.patterns → registered in byPath/byId; allPatterns gets
 *     0 entries for this contract (lock-only contracts are legitimate).
 *
 * @param dao  GraphDAO instance (constructed by caller; the registry never opens DBs).
 * @param asOf ISO-8601 transaction time. Bitemporal active-set predicate ensures supersedes
 *             nodes don't appear; valid_from / invalidated_at gates apply.
 */
export async function loadContractRegistry(dao: GraphDAO, asOf: string): Promise<ContractRegistry> {
	const rows = dao.queryByKind('ContractNode', asOf);

	const byPath = new Map<string, ContractNodeRecord>();
	const byId = new Map<string, ContractNodeRecord>();
	const allPatterns: PatternEntry[] = [];

	for (const row of rows) {
		const parsed = ContractPayload.safeParse(row.payload);
		if (!parsed.success) {
			console.warn(
				`drift/registry.loadContractRegistry: skipping ContractNode ${row.id} — payload failed Zod parse: ${parsed.error.issues.map((i) => i.message).join('; ')}`,
			);
			continue;
		}
		const record: ContractNodeRecord = { id: row.id, payload: parsed.data };
		byId.set(row.id, record);

		const path = parsed.data.contract_path;
		if (path === undefined) {
			console.warn(
				`drift/registry.loadContractRegistry: ContractNode ${row.id} has no contract_path — registered in byId only (not byPath)`,
			);
		} else {
			byPath.set(path, record);
		}

		const patterns = parsed.data.patterns;
		if (patterns !== undefined && patterns.length > 0) {
			// Anchor file for pattern evaluation: prefer contract_path, fall back to anchor.file.
			// Both Plan-07-01 fixtures set both fields to the same value; if a future contract
			// only sets one, we degrade gracefully.
			const anchorFile = path ?? parsed.data.anchor?.file ?? row.id;
			for (let i = 0; i < patterns.length; i++) {
				allPatterns.push({
					contractNodeId: row.id,
					pattern: patterns[i],
					contractAnchorFile: anchorFile,
					patternIndex: i,
				});
			}
		}
	}

	return { byPath, byId, allPatterns };
}
