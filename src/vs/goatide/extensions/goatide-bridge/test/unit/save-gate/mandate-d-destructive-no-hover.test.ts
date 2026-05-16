/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/save-gate/mandate-d-destructive-no-hover.test.ts — Phase 17 Plan 17-01 (Wave-0) RED suite.
//
// POLISH-04 Mandate D pin: destructive saves NEVER use hover dispatch, regardless of
// goatide.saveGate.benign setting. Encoded as a 4×3 (tier, isDestructive) × benignSetting
// matrix snapshot via single deepStrictEqual (per CLAUDE.md Learnings minimize-assertions).
//
// Rows = the 4 reachable (tier, isDestructive) tuples:
//   (silent, false), (inline, false), (modal, false), (modal, true)
// Cols = benignSetting ∈ {modal, hover, suppress}
//
// Expected: RED at Wave-0 close (tier-dispatch.ts has no goatide.saveGate read yet,
// and dispatchHover function does not exist yet).
// Wave 1 Plan 17-02 GREEN-flips these tests.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

// The dispatchHover function will be added by Wave 1. In Wave 0 it does not exist yet.
// We import dispatchTier to build the matrix; dispatchHover assertions fail RED.

describe('POLISH-04 Mandate D — destructive saves never use hover dispatch', () => {

	it('POLISH-04 Mandate D — destructive saves never use hover dispatch (4x3 (tier, isDestructive) x benignSetting matrix snapshot via deepStrictEqual)', async () => {
		// Wave 0 RED: dispatchHover does not exist in tier-dispatch.ts yet.
		// The matrix cannot be built until Wave 1 lands dispatchHover + resource-scoped
		// goatide.saveGate reads. Assert RED with explicit hint.
		//
		// Wave 1 Plan 17-02 GREEN-flips: replaces this assert.fail with the real 4×3
		// matrix construction using mocked dispatchTier inputs per row+col, capturing
		// { panelShowAndAwaitCalls, setStatusBarMessageCalls } per cell, then
		// assert.deepStrictEqual(resultMap, expectedMap) with the Mandate D contract.

		const tierDispatchPath = path.join(
			__dirname,
			'../../src/save-gate/tier-dispatch.ts',
		);

		// Structural check: dispatchHover must not yet exist (Wave-0 contract)
		let tierDispatchSource: string;
		try {
			tierDispatchSource = fs.readFileSync(tierDispatchPath, 'utf8');
		} catch {
			// fall back to compiled .js location
			tierDispatchSource = '';
		}

		const hasDispatchHover = /\bfunction dispatchHover\b/.test(tierDispatchSource)
			|| /\bexport.*dispatchHover\b/.test(tierDispatchSource);

		if (hasDispatchHover) {
			// Wave 1 has landed — build the full matrix
			// (Wave 1 Plan 17-02 should replace this entire test body)
			assert.fail(
				'Wave 1 Plan 17-02 GREEN-flips — dispatchHover found in tier-dispatch.ts; ' +
				'replace this test body with the full 4×3 matrix deepStrictEqual assertion',
			);
		}

		// Wave 0 RED: dispatchHover not yet in source → test correctly RED
		assert.fail(
			'Wave 1 Plan 17-02 GREEN-flips — dispatchHover does not yet exist in tier-dispatch.ts. ' +
			'Wave 1 adds: dispatchHover(doc, citations) for benign hover dispatch; ' +
			'resource-scoped goatide.saveGate.benign/destructive/highImpact reads; ' +
			'and wires the 4×3 (tier, isDestructive) × benignSetting dispatch matrix. ' +
			'This test then validates: ALL (modal, true) cells → panelShowAndAwait called, ' +
			'setStatusBarMessage NOT called; (silent, false, hover) → setStatusBarMessage called; ' +
			'(silent, false, modal) → panelShowAndAwait called; (silent, false, suppress) → both 0; ' +
			'(inline, false, *) → both 0 (inline fires atomically before benignSetting); ' +
			'(modal, false, *) → panelShowAndAwait called (gated by highImpactSetting=confirm).',
		);
	});

	it('dispatchHover only invoked when (tier === silent, isDestructive === false, benignSetting === hover)', async () => {
		// Wave 0 RED: dispatchHover does not exist yet.
		// Wave 1 Plan 17-02 GREEN-flips: asserts exactly 1 dispatchHover call across the
		// 4×3 matrix — only the (silent, false, hover) cell. All other 11 cells: 0 calls.
		assert.fail(
			'Wave 1 Plan 17-02 GREEN-flips — dispatchHover not yet implemented in tier-dispatch.ts. ' +
			'Wave 1 adds the silent-tier benign=hover branch calling dispatchHover(doc, topCitations) ' +
			'and this test verifies the unique (silent, false, hover) invocation.',
		);
	});

	it('caller-count fence — dispatchHover production occurrences in tier-dispatch.ts match the locked count', () => {
		// Pre-pin: the locked caller count for dispatchHover in tier-dispatch.ts production source.
		// Wave 0: count === 0 (function doesn't exist yet) — assert 0 occurrences, which is correct.
		// Wave 1 Plan 17-02 GREEN-flips: changes this to assert count === 2
		// (1 function declaration + 1 caller in the silent-tier benign branch).
		//
		// LOCKED_CALLER_COUNT is a named constant so future edits that bump it from 2 to 3
		// (e.g. adding a JSDoc cross-reference) trigger a deliberate test update rather than
		// silent erosion. Reference Phase 14 Plan 14-03 caller-count fence convention.

		const LOCKED_CALLER_COUNT_WAVE1 = 2; // declaration + 1 caller in silent branch

		const tierDispatchPath = path.resolve(
			__dirname,
			'../../src/save-gate/tier-dispatch.ts',
		);

		let source = '';
		try {
			source = fs.readFileSync(tierDispatchPath, 'utf8');
		} catch {
			source = '';
		}

		// Count all occurrences of the identifier 'dispatchHover' (word boundary)
		const matches = source.match(/\bdispatchHover\b/g) ?? [];
		const count = matches.length;

		// Wave 0: dispatchHover not yet added → count === 0. This is the RED state.
		// Wave 1: count === LOCKED_CALLER_COUNT_WAVE1 (2). This is the GREEN state.
		if (count === 0) {
			// RED state — assert fail with explicit GREEN-flip hint
			assert.fail(
				`Wave 1 Plan 17-02 GREEN-flips — dispatchHover occurrence count in tier-dispatch.ts is ${count}; ` +
				`expected ${LOCKED_CALLER_COUNT_WAVE1} after Wave 1 lands (1 declaration + 1 caller). ` +
				'Update LOCKED_CALLER_COUNT_WAVE1 if future production edits legitimately add a 3rd occurrence.',
			);
		}

		assert.strictEqual(
			count,
			LOCKED_CALLER_COUNT_WAVE1,
			`dispatchHover occurrence count in tier-dispatch.ts must equal ${LOCKED_CALLER_COUNT_WAVE1} ` +
			'(1 declaration + 1 caller in silent-tier benign=hover branch). ' +
			'If you added a JSDoc cross-reference, update LOCKED_CALLER_COUNT_WAVE1 deliberately.',
		);
	});

});
