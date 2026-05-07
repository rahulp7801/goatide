/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/filter/anchor-tuple.ts — Phase 5 Plan 05-05.
//
// Mandate-C exact-equality key for net-new dedup. body_hash = sha256(observation.body) hex;
// file_path comes from claude_jsonl/editor_save observations or undefined for terminal/git
// (which Phase 7 IntentDrift will populate via symbol). Symbol stays undefined in v1.
//
// 05-RESEARCH.md ## Pattern: Five Boolean Predicates predicate 2: the tuple is the EXACT
// equality key — there is no SQL LIKE, no Levenshtein, no embeddings. Pure determinism.

import { createHash } from 'node:crypto';
import type { RawObservation } from '../observations.js';

export interface AnchorTuple {
	/** Absolute or workspace-relative path; undefined when source has no file anchor. */
	file_path?: string;
	/** Symbol-level anchor; v1 stays undefined. Phase 7 IntentDrift may populate. */
	symbol?: string;
	/** SHA-256 hex of observation.body. */
	body_hash: string;
}

/**
 * Compute the exact-equality anchor tuple for an observation. Source-specific file_path
 * resolution: claude_jsonl + editor_save expose file_path directly; terminal_shell uses
 * cwd (the working directory IS the anchor for shell commands); git_commit has no
 * single-file anchor (commit may touch many files), so file_path stays undefined.
 */
export function computeAnchorTuple(obs: RawObservation): AnchorTuple {
	const body_hash = createHash('sha256').update(obs.body).digest('hex');
	let file_path: string | undefined;
	switch (obs.source) {
		case 'claude_jsonl':
		case 'editor_save':
			file_path = obs.file_path;
			break;
		case 'terminal_shell':
			file_path = obs.cwd ?? undefined;
			break;
		case 'git_commit':
			// repo_path is the coarsest anchor we have for a commit (commits touch
			// arbitrarily many files); v1 dedupes at repo granularity. Phase 7 IntentDrift
			// may populate symbol-level anchors via diff parsing.
			file_path = obs.repo_path;
			break;
	}
	return { file_path, symbol: undefined, body_hash };
}
