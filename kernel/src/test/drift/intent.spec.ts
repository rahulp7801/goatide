/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/drift/intent.spec.ts — Phase 7 (Plan 07-01) Wave-0 RED stubs for DRIFT-02.
//
// IntentDrift evaluation: a citation flagged when the cited node's
// derived_under_priority differs from the active session priority. Mandate-C exact-equality
// (Pitfall 5: Speed-First != Speed; Quality-First != Quality). 4 it.skip blocks. Plan 07-05 flips.

import { describe, it } from 'vitest';

describe('drift/intent — Plan 07-05 (DRIFT-02)', () => {
	it.skip('returns empty array when session priority matches all citations — Plan 07-05 has not yet implemented evaluateIntentDrift', () => {});
	it.skip('flags citation when derived_under_priority differs from sessionPriority — Plan 07-05 has not yet implemented evaluateIntentDrift', () => {});
	it.skip('skips citations without derived_under_priority (returns no badge) — Plan 07-05 has not yet implemented evaluateIntentDrift', () => {});
	it.skip('is exact-equality (does not partial-match — Speed-First does NOT match Speed) — Plan 07-05 has not yet implemented evaluateIntentDrift', () => {});
});
