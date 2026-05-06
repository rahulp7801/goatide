/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Wave-0 stub for CANV-04 + CANV-05 — kernel-side pure tier classifier logic.
// Plan 04-02 implements classifyTier(receipt, diff, file_uri) → 'silent' | 'inline' | 'modal'.

import { describe, it } from 'vitest';

describe('CANV-04 + CANV-05 — kernel tier classifier (pure logic)', () => {
	it.skip('signal 1: destructive diff returns modal — Plan 04-02 has not yet implemented classifyTier', () => {});
	it.skip('signal 2: high-impact ContractNode citation returns modal — Plan 04-02 has not yet implemented citesHighImpactContract', () => {});
	it.skip('signal 3: all-Explicit-promoted returns silent — Plan 04-02 has not yet implemented signal weighting', () => {});
	it.skip('signal 4: Inferred-unpromoted returns inline — Plan 04-02 has not yet implemented signal weighting', () => {});
	it.skip('signal 5: empty citations returns silent — Plan 04-02 has not yet implemented empty-citations rule', () => {});
	it.skip('CANV-05 invariant: every tier produces a Receipt (only modality differs) — Plan 04-02 has not yet asserted receipt presence across tiers', () => {});
});
