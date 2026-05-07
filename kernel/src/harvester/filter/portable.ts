/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/filter/portable.ts — Phase 5 Plan 05-05 PORT-01 predicate 1: portable
// (observation generalizes beyond the developer's machine).
//
// CALIBRATION NOTE: defaults derived from .planning/phases/05-telemetry-harvester-portability-filter/05-RESEARCH.md
// ## Pattern: Five Boolean Predicates (MEDIUM confidence). Phase-5-iter calibration
// checkpoint scheduled after ~1 week of dogfood data per STATE.md ## Blockers/Concerns.
// Reject patterns are conservative; tune from real harvested rejected_observations.jsonl.

import type { RawObservation } from '../observations.js';
import type { FilterContext } from './index.js';

const NON_PORTABLE_PATTERNS: readonly { name: string; re: RegExp }[] = [
	{ name: 'unix-home-path', re: /\/Users\/[^/\s]+\// },
	{ name: 'linux-home-path', re: /\/home\/[^/\s]+\// },
	{ name: 'windows-user-path', re: /[A-Z]:\\Users\\[^\\\s]+\\/ },
	{ name: 'unix-private-temp', re: /\/private\/var\/folders\// },
	{ name: 'windows-shell-prompt', re: /^PS\s+[A-Z]:\\/m },
	{ name: 'lone-uuid', re: /^\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\s*$/i },
	{ name: 'embedded-uuid-low-context', re: /\bsession_id\s+[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i },
];

/**
 * Predicate 1 of 5. Reject observations whose body contains tokens that don't generalize
 * past one machine — absolute home directories, ephemeral session UUIDs, machine-specific
 * shell prompts. Accept everything else; the verifiable predicate downstream filters
 * unfalsifiable opinions separately.
 */
export function isPortable(obs: RawObservation, _ctx: FilterContext): { ok: boolean; reason?: string } {
	for (const { name, re } of NON_PORTABLE_PATTERNS) {
		if (re.test(obs.body)) {
			return { ok: false, reason: `matches non-portable pattern: ${name}` };
		}
	}
	return { ok: true };
}
