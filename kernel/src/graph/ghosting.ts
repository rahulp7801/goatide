/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/graph/ghosting.ts — Phase 2 (Plan 02-03) Ghosting predicate.
//
// Centralized Ghosting refusal predicate (GRAPH-12, PROMPT.md §6). Reused by:
//   - payloads.ts (.refine() on the Body schema — first-line refusal at the Zod boundary)
//   - tests (so the Zod layer test and the CHECK layer test agree on the predicate)
// The CHECK constraint in schema/nodes.ts uses the same three tokens hardcoded into SQL.
//
// Trade-off documented: substring match catches false positives like 'the summary table'.
// This is intentional — the requirement (GRAPH-12, PROMPT.md §6) names three exact strings
// ('thanks', 'finished', 'summary') and prefers false positives over false negatives in a
// Mandate-B-bound ledger. See GHOSTING_VIOLATIONS.embedded fixture for the canonical
// false-positive case.

export const GHOSTING_TOKENS = ['thanks', 'finished', 'summary'] as const;

/**
 * Returns true iff `s` contains any of the three Ghosting tokens
 * ('thanks', 'finished', 'summary') as a case-insensitive substring.
 *
 * Safe on `undefined`/`null`/non-strings (returns false) so the predicate can be
 * applied defensively to user-supplied payloads without a separate type guard.
 */
export function hasGhostingTokens(s: string): boolean {
	if (typeof s !== 'string' || s.length === 0) {
		return false;
	}
	const lower = s.toLowerCase();
	return GHOSTING_TOKENS.some((t) => lower.includes(t));
}
