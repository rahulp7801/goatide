/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/filter/verifiable.ts — Phase 5 Plan 05-05 PORT-01 predicate 4:
// verifiable (claim has a falsifiable shape, not just a subjective adjective).
//
// CALIBRATION NOTE: defaults derived from .planning/phases/05-telemetry-harvester-portability-filter/05-RESEARCH.md
// ## Pattern: Five Boolean Predicates (MEDIUM confidence). Phase-5-iter calibration
// checkpoint scheduled after ~1 week of dogfood data per STATE.md ## Blockers/Concerns.
// The shape catalogue below is conservative — extending it to catch more unfalsifiable
// patterns is a follow-up; over-rejection drives signal loss, under-rejection drives
// promoter-token waste on opinions.

import type { RawObservation } from '../observations.js';
import type { FilterContext } from './index.js';

/**
 * Single-clause subjective-adjective body shape. Catches the canonical
 * "this code is beautiful" / "the function is messy" / "this codebase has a beautiful
 * aesthetic" pattern without snagging compound claims that happen to contain a
 * subjective adjective elsewhere.
 */
const UNFALSIFIABLE_SUBJECTIVE = /^\s*(this|that|the|it)\s+(code|codebase|function|class|file|module|implementation|team)\s+(is|has|feels?|looks?)\s+(an?\s+)?(beautiful|ugly|elegant|messy|clean|dirty|nice|bad|good|aesthetic|pretty|cool|simple|complex|complicated|preference|style)(\s+\w+)?\s*\.?\s*$/i;

/**
 * Vague intent without structural commitment ("we should refactor this someday";
 * "I think we should refactor this module someday").
 */
const UNFALSIFIABLE_VAGUE_INTENT = /^\s*(i think|maybe|perhaps|i feel|we should|let's|maybe we should|someone should|i think we should)\b.*\b(refactor|clean up|improve|fix up|rewrite|simplify)\b/i;

/** Single-word feeling. */
const UNFALSIFIABLE_FEELING_FRAGMENT = /^\s*(feels?|looks?|seems?)\s+(cleaner|nicer|better|worse|messier|prettier)(\s+now)?\s*\.?\s*$/i;

/** Preference-only statement. */
const UNFALSIFIABLE_PREFERENCE = /^\s*(the team|we|i|my team)\s+(prefers?|likes?|tends? to use|favou?rs?)\s+/i;

const UNFALSIFIABLE_SHAPES: readonly { name: string; re: RegExp }[] = [
	{ name: 'subjective-adjective', re: UNFALSIFIABLE_SUBJECTIVE },
	{ name: 'vague-intent', re: UNFALSIFIABLE_VAGUE_INTENT },
	{ name: 'feeling-fragment', re: UNFALSIFIABLE_FEELING_FRAGMENT },
	{ name: 'preference-only', re: UNFALSIFIABLE_PREFERENCE },
];

/**
 * Predicate 4 of 5. Reject when the body matches one of the unfalsifiability shapes.
 * Default-accept: most bodies are structural (a diff, a commit message with a clause,
 * a Claude turn explaining a constraint). Only "pure opinion" shapes are rejected.
 */
export function isVerifiable(obs: RawObservation, _ctx: FilterContext): { ok: boolean; reason?: string } {
	for (const { name, re } of UNFALSIFIABLE_SHAPES) {
		if (re.test(obs.body)) {
			return { ok: false, reason: `unfalsifiable shape: ${name}` };
		}
	}
	return { ok: true };
}
