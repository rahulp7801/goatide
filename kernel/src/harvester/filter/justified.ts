/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/filter/justified.ts — Phase 5 Plan 05-05 PORT-01 predicate 5:
// justified (observation includes per-source rationale context, not just a bare event).
//
// Per-source heuristics:
//   - claude_jsonl: always justified — turns include reasoning by construction.
//   - editor_save: justified iff body non-empty OR line_count > 0 (a substantive save).
//   - terminal_shell: justified iff non-empty output OR non-zero exit code (errored
//     commands ARE the justification per 05-RESEARCH.md ## Pattern: Five Boolean
//     Predicates predicate 5).
//   - git_commit: justified iff non-empty message or non-empty diff (the rare empty-commit
//     case rejects).
//
// Trivial-message rejection ('wip', 'saved file', 'ls', 'pwd' alone) is layered on top —
// any body that is a single bare token from a known low-signal allowlist is rejected
// regardless of source. This catches the "saved file" editor_save case and the "ls"
// terminal_shell case from the golden corpus.

import type { RawObservation } from '../observations.js';
import type { FilterContext } from './index.js';

const TRIVIAL_BODY_ALLOWLIST: ReadonlySet<string> = new Set([
	'ls', 'pwd', 'cd', 'wip', 'saved file', 'saved', 'feels cleaner now', 'fix', 'stuff',
]);

function isTrivialBody(body: string): boolean {
	const normalized = body.trim().toLowerCase();
	return TRIVIAL_BODY_ALLOWLIST.has(normalized);
}

/**
 * Predicate 5 of 5. Per-source missing-justification heuristics + trivial-body backstop.
 */
export function isJustified(obs: RawObservation, _ctx: FilterContext): { ok: boolean; reason?: string } {
	if (isTrivialBody(obs.body)) {
		return { ok: false, reason: `trivial body without rationale: "${obs.body.slice(0, 40)}"` };
	}
	switch (obs.source) {
		case 'claude_jsonl':
			return { ok: true };
		case 'editor_save':
			if (obs.body.length === 0 && obs.line_count === 0) {
				return { ok: false, reason: 'editor save with empty body and zero line_count' };
			}
			return { ok: true };
		case 'terminal_shell': {
			const hasOutput = obs.output.length > 0;
			const failed = obs.exit_code !== null && obs.exit_code !== 0;
			if (!hasOutput && !failed) {
				return { ok: false, reason: 'terminal command with no output and zero exit code' };
			}
			return { ok: true };
		}
		case 'git_commit': {
			const hasMessage = (obs.message ?? '').length > 0;
			const hasDiff = (obs.diff ?? '').length > 0;
			if (!hasMessage && !hasDiff) {
				return { ok: false, reason: 'empty commit (no message, no diff)' };
			}
			return { ok: true };
		}
		case 'mcp_external_signal': {
			// Phase 6 Plan 06-05: external MCP signals carry their own context (provider +
			// tool_name + body extracted from the tool-call result). Justified iff the body
			// is non-empty after the schema-mapper extractor runs. Empty bodies (e.g. an
			// empty Slack thread) reject — there's nothing to classify.
			if (obs.body.trim().length === 0) {
				return { ok: false, reason: 'empty MCP external signal body' };
			}
			return { ok: true };
		}
	}
}
