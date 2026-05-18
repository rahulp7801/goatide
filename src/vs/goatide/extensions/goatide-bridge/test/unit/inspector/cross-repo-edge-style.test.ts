/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/inspector/cross-repo-edge-style.test.ts -- Phase 21 Plan 21-01 XREPO-03b.
//
// Regression sentry for the Phase 17 dormant crossRepo edge selector in palette.ts.
// GRAPHIFY_STYLE must contain an entry with selector 'edge[?crossRepo]' with dashed
// line-style and amber-400 (#fbbf24) line-color (PALETTE.crossRepoEdge).
//
// This test GREEN-flips immediately on landing if Phase 17 wiring is intact (verified).
// If the selector is accidentally removed in a future refactor, this test RED-flips and
// blocks the regression.
//
// Grep alignment: 'GRAPHIFY_STYLE.*crossRepo' (21-VALIDATION.md task 21-01-XREPO-03b).

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';

describe('Phase 21 XREPO-03b -- GRAPHIFY_STYLE crossRepo edge selector (regression sentry)', () => {

	it('GRAPHIFY_STYLE crossRepo selector renders dashed amber line', async () => {
		const { GRAPHIFY_STYLE } = await import('../../../src/inspector/webview/palette.js');

		// Find the cross-repo edge style entry.
		const crossRepoEntry = (GRAPHIFY_STYLE as Array<{ selector: string; style: Record<string, unknown> }>)
			.find(entry => entry.selector === 'edge[?crossRepo]');

		assert.ok(
			crossRepoEntry !== undefined,
			'GRAPHIFY_STYLE must contain an entry with selector "edge[?crossRepo]" (Phase 17 wiring regression sentry)',
		);
		assert.strictEqual(
			crossRepoEntry.style['line-style'],
			'dashed',
			'crossRepo edge must have line-style: dashed',
		);
		assert.strictEqual(
			crossRepoEntry.style['line-color'],
			'#fbbf24',
			'crossRepo edge must have line-color: #fbbf24 (amber-400 -- PALETTE.crossRepoEdge)',
		);
	});
});
