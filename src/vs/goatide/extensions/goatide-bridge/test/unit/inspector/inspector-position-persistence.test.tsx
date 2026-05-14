/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// RED stub for Plan 15-04 - Wave-0-first per Nyquist Dim 8d. GREEN-flips when Wave 3 lands
// the Graph.tsx Cytoscape mount with first-fcose / subsequent-preset behavior (RESEARCH
// Open Decision 3 + 10 + Pattern 6).
//
// Note: if the Task 8 Cytoscape-under-jsdom spike returns spike-fail, this test downgrades
// to playwright (Plan 15-05 phase-verify). The describe-block name stays stable for
// VALIDATION.md grep continuity regardless.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';

describe('inspector position persistence', () => {
	it('uses cy.layout({name:"preset"}) on second show with persisted positions', () => {
		// Wave 3 lands the Graph.tsx Cytoscape mount + first-show=fcose / subsequent-show=preset
		// layout behavior (RESEARCH Open Decision 3 + 10 + Pattern 6). At Wave 0 the source
		// file does not exist; this is RED by design.
		//
		// On Wave 3 GREEN-flip, this body becomes a sinon spy on cy.layout that asserts
		// the first show calls layout with name:"fcose" and the second show calls layout
		// with name:"preset" + the positions captured from the first show's cy.nodes().
		assert.fail('Wave 3 implements - Plan 15-04 GREEN-flips (RESEARCH Pattern 6 position persistence)');
	});
});
