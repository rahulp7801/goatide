/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/drift/lock-detector.spec.ts — Phase 7 (Plan 07-01) Wave-0 RED stubs for DRIFT-03.
//
// Lock detector: returns LockTrigger when a diff hunk overlaps any enforcing section of a
// registered contract path; null otherwise (cosmetic-only edits pass silently). Co-fires
// alongside the destructive pattern detector when an enforcing-section edit is also a
// pattern violation. 4 it.skip blocks. Plan 07-03 flips.

import { describe, it } from 'vitest';

describe('drift/lock-detector — Plan 07-03 (DRIFT-03)', () => {
	it.skip('returns null when file is not a registered contract path — Plan 07-03 has not yet implemented evaluateLockTrigger', () => {});
	it.skip('returns null for cosmetic-only edit (non-enforcing-section overlap) — Plan 07-03 has not yet implemented evaluateLockTrigger', () => {});
	it.skip('returns LockTrigger when hunk overlaps enforcing section — Plan 07-03 has not yet implemented evaluateLockTrigger', () => {});
	it.skip('lock fires alongside destructive detector for destructive enforcing-section edits — Plan 07-03 has not yet implemented evaluateLockTrigger', () => {});
});
