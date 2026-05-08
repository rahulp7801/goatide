/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/drift/detector.ts — Phase 7 (Plan 07-02) DRIFT-01 detector orchestrator.
//
// Walks parsePatch(diff) → per-file → per-hunk → for each pattern in the contract registry,
// dispatches to the matching evaluator in patterns.ts, and collects DriftFinding[]. Returns
// findings sorted deterministically (Pitfall 1 + test-stability requirement).
//
// Mandate-C: zero LLM, zero embeddings, zero string-similarity. Every dispatch is to a pure
// regex / jsonpath / forbidden_import evaluator. The registry is read-only. The DAO is not
// touched (loadContractRegistry happened once at the bridge boundary).
//
// JSON reconstruction limitation (documented for jsonpath patterns): a unified diff only
// shows hunks, not full file content. The detector reconstructs the file content from the
// concatenation of all `+` lines in all hunks for that file. For full-file replacement
// diffs (the common case in our test fixtures), this is exact. For partial diffs against a
// pre-existing file, the reconstructed JSON is incomplete and JSON.parse will fail open
// via console.warn (handled inside evalJsonpathPattern). Plan 07-07 (bridge save-gate)
// will pass the full new-file content alongside the diff so the production path uses
// the actual document.getText() value rather than a reconstruction.

import { parsePatch, type ParsedDiff, type Hunk } from 'diff';
import {
	evalRegexPattern,
	evalJsonpathPattern,
	evalForbiddenImport,
	type AddedLine,
} from './patterns.js';
import type { ContractRegistry, DriftFinding } from './types.js';

export interface DriftDetectorInput {
	/** Unified diff string (e.g. from `git diff` or jsdiff createPatch). */
	readonly diff: string;
	/** Pre-loaded contract registry — caller is responsible for asOf snapshot consistency. */
	readonly contractRegistry: ContractRegistry;
	/** ISO-8601 transaction time used to load the registry. Reserved for future per-finding metadata. */
	readonly asOf: string;
}

/** Strip git's `a/` or `b/` prefix from a diff filename header. Preserves `/dev/null`. */
function stripGitPrefix(name: string | undefined): string | undefined {
	if (!name || name === '/dev/null') {
		return undefined;
	}
	if (name.startsWith('a/') || name.startsWith('b/')) {
		return name.slice(2);
	}
	return name;
}

/** Pick the post-image filename for a parsed diff (newFileName, falling back to oldFileName). */
function fileNameFor(p: ParsedDiff): string | undefined {
	return stripGitPrefix(p.newFileName) ?? stripGitPrefix(p.oldFileName);
}

/**
 * Extract the added-line list from a single hunk. `hunk.lines` is an array of strings each
 * prefixed with one of `+`, `-`, ` `, or starts with `\` for "no newline at end of file".
 *
 * Returned `lineNumber` is 1-indexed in the new file and increments only for ` ` (context)
 * and `+` (added) lines, matching `git diff` line-number semantics.
 */
function extractAddedLines(hunk: Hunk): AddedLine[] {
	const out: AddedLine[] = [];
	let cursor = hunk.newStart;
	for (const raw of hunk.lines) {
		if (raw.startsWith('\\')) {
			// "\ No newline at end of file" marker — skip without consuming a line number.
			continue;
		}
		const marker = raw.charAt(0);
		const body = raw.slice(1);
		if (marker === '+') {
			out.push({ line: body, lineNumber: cursor });
			cursor += 1;
		} else if (marker === ' ') {
			cursor += 1;
		}
		// '-' lines do NOT advance the new-file cursor.
	}
	return out;
}

/** Concatenate all `+` lines across all hunks for one file — used to reconstruct JSON. */
function reconstructAddedContent(p: ParsedDiff): string {
	const parts: string[] = [];
	for (const hunk of p.hunks) {
		for (const raw of hunk.lines) {
			if (raw.startsWith('\\')) {
				continue;
			}
			if (raw.startsWith('+')) {
				parts.push(raw.slice(1));
			}
		}
	}
	return parts.join('\n');
}

/**
 * Run the drift detector against a unified diff using a pre-loaded contract registry.
 *
 * Returns findings sorted by [contract_node_id, pattern_index, file, hunk_line] so that
 * repeated invocations on the same input produce byte-equal output (deterministic-ordering
 * test pin in detector.spec.ts).
 *
 * Empty diff → []. Diff to file outside any pattern's scope → []. Malformed JSON in a
 * .json file → console.warn from evalJsonpathPattern + [] for that pattern (fail open;
 * other patterns continue to evaluate).
 */
export function runDriftDetector(input: DriftDetectorInput): DriftFinding[] {
	if (input.diff.length === 0) {
		return [];
	}
	const parsedDiffs: ParsedDiff[] = parsePatch(input.diff);
	const findings: DriftFinding[] = [];

	for (const parsed of parsedDiffs) {
		const filePath = fileNameFor(parsed);
		if (!filePath) {
			continue;
		}
		// Per-file added-line list (across all hunks, concatenated in hunk order).
		const allAdded: AddedLine[] = [];
		for (const hunk of parsed.hunks) {
			for (const al of extractAddedLines(hunk)) {
				allAdded.push(al);
			}
		}
		// Per-file reconstructed content (for jsonpath only).
		const reconstructedJson = reconstructAddedContent(parsed);

		for (const entry of input.contractRegistry.allPatterns) {
			if (entry.pattern.kind === 'regex') {
				const fs = evalRegexPattern(
					allAdded,
					entry.pattern,
					filePath,
					entry.contractAnchorFile,
					entry.contractNodeId,
					entry.patternIndex,
				);
				for (const f of fs) {
					findings.push(f);
				}
			} else if (entry.pattern.kind === 'jsonpath') {
				// jsonpath is whole-file; only meaningful when the file is .json/.jsonc.
				// evalJsonpathPattern enforces the suffix check + fails open on malformed.
				const fs = evalJsonpathPattern(
					reconstructedJson,
					entry.pattern,
					filePath,
					entry.contractAnchorFile,
					entry.contractNodeId,
					entry.patternIndex,
				);
				for (const f of fs) {
					findings.push(f);
				}
			} else {
				// forbidden_import
				const fs = evalForbiddenImport(
					allAdded,
					entry.pattern,
					filePath,
					entry.contractAnchorFile,
					entry.contractNodeId,
					entry.patternIndex,
				);
				for (const f of fs) {
					findings.push(f);
				}
			}
		}
	}

	// Deterministic ordering — pinned by detector.spec.ts.
	findings.sort((a, b) => {
		if (a.contract_node_id !== b.contract_node_id) {
			return a.contract_node_id < b.contract_node_id ? -1 : 1;
		}
		if (a.pattern_index !== b.pattern_index) {
			return a.pattern_index - b.pattern_index;
		}
		if (a.file !== b.file) {
			return a.file < b.file ? -1 : 1;
		}
		return a.hunk_line - b.hunk_line;
	});
	return findings;
}
