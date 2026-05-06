/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/canvas/classifier.ts — Phase 4 (Plan 04-02) tier classifier.
//
// Per 04-RESEARCH.md ## Pattern: Tier Classifier. CANV-04 + CANV-05 + CANV-08:
//   - destructive change → modal (CANV-08 forces; cannot be downgraded)
//   - cites high-impact ContractNode → modal (CANV-04)
//   - empty citations → silent (nothing to surface)
//   - all-Explicit-promoted → silent (ROADMAP SC #4)
//   - any Inferred-unpromoted citation → inline (ROADMAP SC #4)
//   - default → silent (defensive)
//
// CONFIDENCE: MEDIUM. Signal weighting has no public prior art (STATE.md ## Blockers/Concerns).
// The 5 signals above are derived from REQUIREMENTS + ROADMAP success criterion #4 verbatim.
// The contract-allowlist prefix set is config-driven (caller passes; default exported below)
// with a 2-week revisit checkpoint after Phase 4 closes.
//
// Anti-pattern: NO scoring / weighting. Ordered guard chain only. Adding weights would invite
// an "is the score 7.3 enough for modal?" debate that has no good answer in the absence of
// dogfood data.

import { detectDestructive } from './destructive.js';
import type { CanvasTier, CitationDetail, TierClassifierInputs } from './types.js';

/**
 * Default contract-path prefixes that route a citation to the modal tier.
 * Phase 4 ships with these three; Phase 7 (DRIFT) extends to a registry.
 */
export const DEFAULT_HIGH_IMPACT_CONTRACT_PREFIXES: readonly string[] = [
	'/contracts/security/',
	'/contracts/api/',
	'/contracts/data/',
];

function citesHighImpactContract(
	citationDetails: readonly CitationDetail[] | undefined,
	allowlist: readonly string[],
): boolean {
	if (!citationDetails || citationDetails.length === 0) {
		return false;
	}
	if (allowlist.length === 0) {
		return false;
	}
	return citationDetails.some((d) => {
		if (d.kind !== 'ContractNode') {
			return false;
		}
		if (!d.contract_path) {
			return false;
		}
		return allowlist.some((prefix) => d.contract_path!.startsWith(prefix));
	});
}

/**
 * Classify a proposed save into one of three tiers. Pure function — no IO, no DAO, no VS Code.
 *
 * Caller (Plan 04-04 bridge save-gate) is responsible for:
 *   1. Calling kernel.proposeEdit(diff) to obtain the receipt.
 *   2. Hydrating citationDetails by calling kernel.queryGraph or dao.queryById per citation.
 *   3. Passing contractAllowlist (default: DEFAULT_HIGH_IMPACT_CONTRACT_PREFIXES, but
 *      .planning/config.json may override).
 *   4. Routing the returned tier to the silent / inline / modal handler.
 */
export function classifyTier(inputs: TierClassifierInputs): CanvasTier {
	// HARD-PIN signals — no override possible:
	if (detectDestructive(inputs.diff, inputs.anchorPath)) {
		return 'modal';                                // CANV-08 (destructive forces modal)
	}
	const allowlist = inputs.contractAllowlist ?? DEFAULT_HIGH_IMPACT_CONTRACT_PREFIXES;
	if (citesHighImpactContract(inputs.citationDetails, allowlist)) {
		return 'modal';                                // CANV-04 (high-impact ContractNode)
	}

	// SOFT signals (ordered for unambiguous routing):
	const cs = inputs.receipt.citations;
	if (cs.length === 0) {
		return 'silent';                               // empty: nothing to surface; CANV-05 still emits the receipt
	}
	const allExplicit = cs.every((c) => c.confidence === 'Explicit');
	if (allExplicit) {
		return 'silent';                               // ROADMAP SC #4: all-Explicit-promoted → silent
	}
	const hasInferred = cs.some((c) => c.confidence === 'Inferred');
	if (hasInferred) {
		return 'inline';                               // ROADMAP SC #4: any Inferred-unpromoted → inline
	}

	return 'silent';                                  // defensive default (unreachable in practice)
}
