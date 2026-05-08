/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/drift/detector.spec.ts — Phase 7 (Plan 07-01) Wave-0 RED stubs for DRIFT-01.
//
// 5 it.skip stubs registered at Wave 0; Plan 07-02 flips them green when
// kernel/src/drift/detector.ts lands. Pattern matches Phase-6 Plan 06-01 stub style:
// describe block titled by plan + requirement, each it.skip names the failure mode.

import { describe, it } from 'vitest';

describe('drift/detector — Plan 07-02 (DRIFT-01)', () => {
	it.skip('detects regex required-pattern violation in added line — Plan 07-02 has not yet implemented the detector', () => {});
	it.skip('detects forbidden_import violation in added line — Plan 07-02 has not yet implemented the detector', () => {});
	it.skip('detects jsonpath pattern violation in JSON file — Plan 07-02 has not yet implemented the detector', () => {});
	it.skip('returns empty findings for clean diff — Plan 07-02 has not yet implemented the detector', () => {});
	it.skip('pattern.scope filter excludes non-matching files — Plan 07-02 has not yet implemented the detector', () => {});
});
