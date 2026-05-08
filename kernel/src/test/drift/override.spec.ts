/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/drift/override.spec.ts — Phase 7 (Plan 07-01) Wave-0 RED stubs for DRIFT-06.
//
// Contract-override audit trail: every override of a Contract lock seeds an Attempt(attempt_kind=
// 'contract_override') with the developer's note (≥1 char required), wires a `references` edge
// from the Attempt to the ContractNode, and increments harvest_metrics_daily.contract_overrides
// (source='canvas'). 5 it.skip blocks. Plan 07-06 flips.

import { describe, it } from 'vitest';

describe('drift/override — Plan 07-06 (DRIFT-06)', () => {
	it.skip('graph.recordContractOverride seeds Attempt(attempt_kind=contract_override) — Plan 07-06 has not yet implemented recordContractOverride', () => {});
	it.skip('override note ≥1 char required (rejects empty) — Plan 07-06 has not yet implemented recordContractOverride', () => {});
	it.skip('writes references edge from Attempt to ContractNode — Plan 07-06 has not yet implemented recordContractOverride', () => {});
	it.skip('increments contract_overrides metric on harvest_metrics_daily — Plan 07-06 has not yet implemented recordContractOverride', () => {});
	it.skip('rejects invalid contract_node_id — Plan 07-06 has not yet implemented recordContractOverride', () => {});
});
