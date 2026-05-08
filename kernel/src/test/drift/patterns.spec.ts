/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/drift/patterns.spec.ts — Phase 7 (Plan 07-01) Wave-0 RED stubs for DRIFT-01.
//
// Per-pattern-type unit tests (regex / jsonpath / forbidden_import). 3 it.skip blocks.
// Plan 07-02 flips them green alongside the detector spec.

import { describe, it } from 'vitest';

describe('drift/patterns — Plan 07-02 (DRIFT-01)', () => {
	it.skip('regex pattern: required:true line missing → reports violation; required:false line present → reports violation — Plan 07-02 has not yet implemented patterns module', () => {});
	it.skip('jsonpath pattern: op=exists / op=eq / op=in resolve correctly against parsed JSON — Plan 07-02 has not yet implemented patterns module', () => {});
	it.skip('forbidden_import pattern: ES + CJS import forms detected; non-import string mention does not false-fire — Plan 07-02 has not yet implemented patterns module', () => {});
});
