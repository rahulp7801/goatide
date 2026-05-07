/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/filter/project-relevant.ts — Phase 5 Plan 05-05 PORT-01 predicate 3:
// project-relevant (file_path is inside an active workspace folder).
//
// String-prefix match against ctx.workspaceFolders (absolute paths set at daemon-start
// time, refreshed via future RPC). Mandate-C: NO glob, NO LIKE, NO regex on file_path —
// pure prefix equality only.
//
// Observations with no file_path (terminal_shell without cwd, claude_jsonl turns lacking
// file context) PASS through accept by default. The verifiable predicate downstream
// handles unanchored unfalsifiable claims; project-relevant is purely a workspace-scope
// gate, not a "file exists" check.

import type { RawObservation } from '../observations.js';
import type { FilterContext } from './index.js';

function getFilePath(obs: RawObservation): string | undefined {
	switch (obs.source) {
		case 'claude_jsonl':
		case 'editor_save':
			return obs.file_path;
		case 'terminal_shell':
			return obs.cwd ?? undefined;
		case 'git_commit':
			return obs.repo_path;
	}
}

/**
 * Predicate 3 of 5. Prefix-match against workspaceFolders. Empty workspaceFolders means
 * "no scope set" — we still accept (pre-config / single-folder bootstrap case).
 */
export function isProjectRelevant(obs: RawObservation, ctx: FilterContext): { ok: boolean; reason?: string } {
	const filePath = getFilePath(obs);
	if (!filePath) {
		return { ok: true };
	}
	if (ctx.workspaceFolders.length === 0) {
		return { ok: true };
	}
	for (const folder of ctx.workspaceFolders) {
		if (filePath.startsWith(folder)) {
			return { ok: true };
		}
	}
	return { ok: false, reason: `file_path "${filePath}" is outside all workspace folders` };
}
