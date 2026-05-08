/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/drift/registry.spec.ts — Phase 7 (Plan 07-01) Wave-0 RED stubs for DRIFT-01.
//
// Contract registry: loadContractRegistry queries all active ContractNodes via
// dao.queryByKind('ContractNode'), indexes them by contract_path (or anchor.file fallback)
// for byPath.has() / byPath.get() lookup. 2 it.skip blocks. Plan 07-02 flips.

import { describe, it } from 'vitest';

describe('drift/registry — Plan 07-02 (DRIFT-01 contract registry)', () => {
	it.skip('loadContractRegistry queries all active ContractNodes via dao.queryByKind — Plan 07-02 has not yet implemented loadContractRegistry', () => {});
	it.skip('registry indexes by contract_path for byPath.has() lookup — Plan 07-02 has not yet implemented loadContractRegistry', () => {});
});
