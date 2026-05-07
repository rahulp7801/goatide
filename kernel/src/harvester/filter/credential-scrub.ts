/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/filter/credential-scrub.ts — Phase 5 Plan 05-05 Pitfall-8 hard gate.
//
// Defense-in-depth credential scrub. Runs FIRST in the filter cascade — BEFORE the 5
// PORT-01 predicates. Any observation matching one of the patterns below is rejected
// with predicate='credential_scrub' and never seen by the Promoter LLM (Plan 05-06).
//
// SINGLE SOURCE OF TRUTH: pattern set MUST stay in lockstep with
// scripts/ci/refuse-credential-leaks-in-fixtures.sh (Plan 05-01) — the shell gate scans
// committed fixtures at PR time; this module scans live observations at runtime. Any
// drift breaks the defense-in-depth invariant. If a new pattern is added, update both
// this file AND that script.

import type { RawObservation } from '../observations.js';

/**
 * Patterns the credential-scrub gate matches. Each entry has a stable `name` (logged in
 * the rejected-observation record) and a `re` regex. Scanned against body, output, diff,
 * and message fields per source.
 */
export const CREDENTIAL_PATTERNS: readonly { name: string; re: RegExp }[] = [
	{ name: 'aws-access-key', re: /AKIA[A-Z0-9]{16}/ },
	{ name: 'github-token', re: /gh[poushr]_[A-Za-z0-9]{36}/ },
	{ name: 'anthropic-api-key', re: /sk-ant-/ },
	{ name: 'jwt-shape', re: /eyJ[A-Za-z0-9_=-]{10,}\.[A-Za-z0-9_=-]{10,}/ },
	{ name: 'aws-secret-env', re: /AWS_SECRET_ACCESS_KEY=/ },
	{ name: 'authorization-bearer', re: /Authorization:\s+Bearer/i },
	{ name: 'authorization-header-json', re: /"Authorization"\s*:/ },
];

/**
 * Aggregate the text fields that may carry secret material for a given source. Bodies
 * are the universal channel; terminal_shell adds output; git_commit adds diff + message.
 */
function fieldsToScrub(obs: RawObservation): readonly string[] {
	const fields: string[] = [obs.body];
	switch (obs.source) {
		case 'terminal_shell':
			fields.push(obs.output);
			break;
		case 'git_commit':
			if (obs.diff) {
				fields.push(obs.diff);
			}
			if (obs.message) {
				fields.push(obs.message);
			}
			break;
		case 'claude_jsonl':
		case 'editor_save':
			break;
	}
	return fields;
}

/**
 * Run the credential scrub. First match wins; the matched pattern name appears in the
 * reason (logged to rejected_observations.jsonl for audit; never returned to the bridge
 * verbatim because the bridge surface is opaque per PORT-02 silent-rejection).
 */
export function scrubForCredentials(obs: RawObservation): { ok: boolean; reason?: string } {
	const fields = fieldsToScrub(obs);
	for (const text of fields) {
		for (const { name, re } of CREDENTIAL_PATTERNS) {
			if (re.test(text)) {
				return { ok: false, reason: `credential pattern: ${name}` };
			}
		}
	}
	return { ok: true };
}
