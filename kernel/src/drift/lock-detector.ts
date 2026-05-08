/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/drift/lock-detector.ts — Phase 7 (Plan 07-03) DRIFT-03 contract lock detector.
//
// Cross-references parsed-diff hunk line ranges against the enforcing-section line ranges
// of registered contracts. When ANY hunk overlaps ANY enforcing section, returns a
// LockTrigger; otherwise null. First overlap wins (deterministic — parsePatch result
// + Map iteration order are stable).
//
// Cosmetic-pass-silent invariant (SC #3 acceptance criterion verbatim): a diff against an
// enforcing-section's parent file that ONLY touches non-enforcing sections returns null —
// the existing Phase-4 silent-receipt path proceeds unchanged. The "developer fixes a typo
// in a non-enforcing section" path passes silently with no ripple report.
//
// Orthogonality with pattern detector: Plan 07-02's runDriftDetector and Plan 07-03's
// detectsContractLock are independent — a diff can trigger BOTH (a forbidden-import
// violation INSIDE an enforcing section produces both a DriftFinding and a LockTrigger).
// Plan 07-07 wires both into the bridge save-gate; the modal tier fires if either is
// non-empty / non-null.

import { parsePatch, type ParsedDiff, type Hunk } from 'diff';
import { parseSections, type SectionRange } from './section-parser.js';
import type { ContractRegistry, ContractNodeRecord, LockTrigger } from './types.js';

export interface LockDetectorInput {
	readonly diff: string;
	readonly contractRegistry: ContractRegistry;
}

/**
 * Inclusive-overlap test for two 1-indexed line ranges [a1, a2] and [b1, b2].
 * Returns true iff there exists at least one line covered by BOTH ranges.
 */
function rangesOverlap(a1: number, a2: number, b1: number, b2: number): boolean {
	return a1 <= b2 && b1 <= a2;
}

/**
 * Strip a unified-diff filename prefix (`a/` for old, `b/` for new) so the result matches
 * contractRegistry.byPath keys (which use the un-prefixed contract path). `parsePatch`
 * preserves the prefix as it appears in the diff header.
 */
function stripDiffFilenamePrefix(name: string | undefined): string | undefined {
	if (!name || name === '/dev/null') {
		return undefined;
	}
	if (name.startsWith('a/') || name.startsWith('b/')) {
		return name.slice(2);
	}
	return name;
}

/**
 * Resolve a parsed diff entry's effective filename: prefer newFileName (the post-edit name)
 * unless it's '/dev/null' (a deletion), in which case fall back to oldFileName.
 */
function resolveDiffFilename(parsed: ParsedDiff): string | undefined {
	const newName = stripDiffFilenamePrefix(parsed.newFileName);
	if (newName !== undefined) {
		return newName;
	}
	return stripDiffFilenamePrefix(parsed.oldFileName);
}

/**
 * Filter the parsed-section map down to those entries whose names appear in the contract's
 * enforcing_sections list. Returns the entries as [name, range] tuples preserving iteration
 * order.
 */
function selectEnforcingSections(
	sections: Map<string, SectionRange>,
	enforcingNames: readonly string[],
): { name: string; range: SectionRange }[] {
	const result: { name: string; range: SectionRange }[] = [];
	for (const name of enforcingNames) {
		const range = sections.get(name);
		if (range !== undefined) {
			result.push({ name, range });
		}
	}
	return result;
}

/**
 * Determine whether a unified-diff string triggers any contract lock by overlapping at
 * least one enforcing-section line range of a registered ContractNode.
 *
 * Flow:
 *   1. parsePatch(diff) → ParsedDiff[].
 *   2. For each parsed file:
 *      a. Resolve filename and look up registry.byPath. Skip if not registered.
 *      b. Read enforcing_sections from the contract's payload. Skip if empty/undefined.
 *      c. Run parseSections on the contract body to get section ranges.
 *      d. Filter to enforcing sections (named in the enforcing_sections list).
 *   3. For each hunk (with hunk_index):
 *      a. Compute editedLineRange = [hunk.newStart, hunk.newStart + hunk.newLines - 1].
 *      b. For each enforcing section: if rangesOverlap → return LockTrigger.
 *   4. If no overlap → return null.
 *
 * @param input diff + pre-loaded contractRegistry (Plan 07-07 caller invokes loadContractRegistry once per save dispatch).
 * @returns     LockTrigger on first overlap (first match wins); null if no enforcing-section overlap.
 */
export function detectsContractLock(input: LockDetectorInput): LockTrigger | null {
	const parsed: ParsedDiff[] = parsePatch(input.diff);
	const registry = input.contractRegistry;

	for (const fileDiff of parsed) {
		const filename = resolveDiffFilename(fileDiff);
		if (filename === undefined) {
			continue;
		}
		const contract: ContractNodeRecord | undefined = registry.byPath.get(filename);
		if (contract === undefined) {
			continue;
		}
		const enforcing = contract.payload.enforcing_sections ?? [];
		if (enforcing.length === 0) {
			continue;
		}
		const allSections = parseSections(contract.payload.body);
		const enforcingSections = selectEnforcingSections(allSections, enforcing);
		if (enforcingSections.length === 0) {
			continue;
		}

		const hunks: Hunk[] = fileDiff.hunks ?? [];
		for (let hunkIndex = 0; hunkIndex < hunks.length; hunkIndex++) {
			const hunk = hunks[hunkIndex];
			// Edit range is the post-edit (new-file) line range. newLines may be 0 for a pure
			// deletion hunk — guard with Math.max so a 0-line hunk degenerates to a single-line
			// range starting at newStart (acceptable defensive behavior for rare edge cases).
			const newLines = hunk.newLines > 0 ? hunk.newLines : 1;
			const editStart = hunk.newStart;
			const editEnd = hunk.newStart + newLines - 1;

			for (const { name, range } of enforcingSections) {
				if (rangesOverlap(editStart, editEnd, range.startLine, range.endLine)) {
					return {
						contract_node_id: contract.id,
						contract_anchor_file: filename,
						section_name: name,
						edited_line_range: [editStart, editEnd] as const,
						hunk_index: hunkIndex,
					};
				}
			}
		}
	}

	return null;
}
