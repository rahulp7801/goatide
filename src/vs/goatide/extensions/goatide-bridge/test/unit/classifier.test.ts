/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Wave-0 stub for CANV-04 + CANV-08 — bridge tier classifier integration.
// (Pure-logic classifier itself lives in kernel/src/test/canvas/* — this file covers
// the bridge wiring: classifier output → tier-dispatch → canvas show/silent/inline.)
// Plan 04-02 implements the kernel-side pure classifier; Plan 04-04 wires it into the
// bridge save-gate.

import { describe, it } from 'mocha';

describe('CANV-04 + CANV-08 — bridge tier classifier integration', () => {
	it.skip('classifier: destructive diff routes to modal — Plan 04-02 has not yet implemented classifyTier', () => {
		// Stub. Plan 04-02 fills this in.
	});
	it.skip('classifier: high-impact ContractNode citation routes to modal — Plan 04-02 has not yet implemented citesHighImpactContract', () => {
		// Stub. Plan 04-02.
	});
	it.skip('classifier: all-Explicit-promoted citations route to silent — Plan 04-02 has not yet implemented signal weighting', () => {
		// Stub. Plan 04-02.
	});
	it.skip('classifier: Inferred-unpromoted citation routes to inline — Plan 04-02 has not yet implemented signal weighting', () => {
		// Stub. Plan 04-02.
	});
});
