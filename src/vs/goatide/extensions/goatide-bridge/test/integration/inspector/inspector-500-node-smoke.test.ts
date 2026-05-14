/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/integration/inspector/inspector-500-node-smoke.test.ts — Phase 15 Plan 15-04
// (Wave 3 — spike-fail downgrade to playwright).
//
// SPIKE OUTCOME (Plan 15-01 Task 8): Cytoscape fails under jsdom (`getContext('2d')`
// returns null). The 500-node smoke fundamentally requires cy.layout({name:'fcose'}).run()
// to complete + measurable wall-time from cy.add() through fcose.run() settle, both of
// which need the real canvas renderer. The test is downgraded to it.skip with a comment
// pointing at Plan 15-05 (DEEP-02 phase-verify) for the playwright-based manual smoke.
//
// describe block name preserved verbatim from Wave-0 stub for VALIDATION.md grep continuity.

import { describe, it } from 'mocha';

describe('inspector 500-node smoke', () => {
	// SPIKE: Cytoscape requires a real canvas (jsdom does not implement getContext('2d')).
	// This test runs under playwright in Plan 15-05 phase-verify (manual smoke). The
	// describe-block name stays stable for grep continuity. The implementation contract
	// it tests is:
	//   1. Generate 500 synthetic InspectorNodeRow (canonical 5 kinds round-robin) + 750
	//      synthetic InspectorEdgeRow (1.5x density).
	//   2. Mount cytoscape({container, elements, hideEdgesOnViewport:true,
	//      textureOnViewport:true, pixelRatio:1, ...}) + cy.add() + cy.layout({name:'fcose',
	//      randomize:true, animate:false}).run().
	//   3. Capture wall-time start/end around the cy.add + layout settle; assert
	//      end - start < 2000ms (RESEARCH SC#3 budget).
	it.skip('cy.add + fcose layout completes in < 2s on synthetic 500-node fixture', () => {
		/* see Plan 15-05 phase-verify playwright smoke (RESEARCH SC#3 < 2s 500-node budget) */
	});
});
