/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Canonical fixtures used across all *.spec.ts files. One valid + one Ghosting-violation
// (per token) per node kind. Wave 2 imports these to test Zod refinement; Wave 1 ignores.

export const VALID_PAYLOADS = {
	ConstraintNode: { kind: 'ConstraintNode' as const, body: 'FK columns must coerce empty-string to NULL' },
	DecisionNode: { kind: 'DecisionNode' as const, body: 'Adopted SQLite over Postgres for v1 dogfooding' },
	ContractNode: { kind: 'ContractNode' as const, body: 'All API endpoints require Bearer auth' },
	OpenQuestion: { kind: 'OpenQuestion' as const, body: 'Should retry on 429 use exponential or fixed backoff?' },
	Attempt: { kind: 'Attempt' as const, body: 'Applied auth-middleware patch at HEAD' },
} as const;

// Per Pitfall 8 (RESEARCH.md), the Ghosting CHECK uses `instr(lower(...), 'summary')` —
// substring match. So "summary table" DOES match. This is INTENTIONAL: the requirement says
// "free-text 'summary' patterns are rejected"; the price is occasional false positives on
// legitimate uses of the word in payload bodies. Wave 2's tests assert this fixture is
// REJECTED (with a comment documenting the false-positive trade-off).
export const GHOSTING_VIOLATIONS = {
	thanks: { kind: 'ConstraintNode' as const, body: 'thanks for the help' },
	finished: { kind: 'ConstraintNode' as const, body: 'I have finished the task' },
	summary: { kind: 'ConstraintNode' as const, body: 'Here is a summary of what I did' },
	// Case-insensitivity check — the lower() in the trigger MUST normalize before instr().
	THANKS_uppercase: { kind: 'ConstraintNode' as const, body: 'THANKS for the input' },
	// 'summary' as substring of unrelated word — see comment above.
	embedded: { kind: 'ConstraintNode' as const, body: 'The schema enforces the summary table primary key' },
} as const;

export const INVALID_KIND = { kind: 'NotARealKind', body: 'arbitrary' } as const;

export const VALID_PROVENANCE = {
	source: 'cli' as const,
	actor: 'test-developer',
	detail: { invocation: 'goatide-cli graph seed' },
} as const;
