/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/constraint-lift-no-graph-mutation.test.ts — Phase 16 Plan 16-01 Task 4.
//
// Mandate B regression suite for the hypothetical-impact analyzer (DEEP-03).
// The constraint-lift flow MUST NOT call atomicAccept, proposeEdit, recordRejection,
// or recordContractOverride. Pattern verbatim from Phase 14 Plan 14-04's
// deep05-no-graph-mutation.test.ts (try/finally-wrapped KernelClient.prototype spy).
//
// Five cases — all RED at Wave-0 close because KernelClient.constraintLift is a
// throw-stub (Wave 2 — Plan 16-03 fills the real body). Wave 2 GREEN-flips all 5.
// VALIDATION.md task rows 16-00-19..23 grep target: verbatim case-name strings.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import { KernelClient } from '../../src/kernel/client.js';

// Lightweight spy: replaces a method on `target` with a counter; restore() reverts.
// Pattern from test/integration/inspector/command-registration.test.ts (Phase 15 Plan 15-03).
interface MethodSpy {
	callCount: number;
	calls: unknown[][];
	restore(): void;
}

function spyOn<T extends object, K extends keyof T>(target: T, method: K, replacement?: (...args: unknown[]) => unknown): MethodSpy {
	const original = target[method] as unknown as (...args: unknown[]) => unknown;
	const spy: MethodSpy = { callCount: 0, calls: [], restore: () => { (target[method] as unknown) = original; } };
	(target[method] as unknown) = ((...args: unknown[]) => {
		spy.callCount++;
		spy.calls.push(args);
		return replacement ? replacement(...args) : (original ? original.apply(target, args) : undefined);
	}) as unknown;
	return spy;
}

describe('constraint.lift no graph mutation', () => {
	it('constraint.lift no graph mutation — atomicAccept NOT called across full flow', async () => {
		// Wave-0: KernelClient.constraintLift throws (Wave 2 fills the real body + this asserts
		// callLog empty after the full constraint-lift round-trip).
		const spy = spyOn(KernelClient.prototype as object, 'atomicAccept' as keyof object);
		try {
			// Wave-0 assert: constraintLift throws before any write RPC could be called.
			// Wave 2 asserts spy.callCount === 0 after real constraintLift resolves.
			assert.fail('Wave 2 implements - Plan 16-03 GREEN-flips (KernelClient.constraintLift throw-stub)');
		} catch (e: unknown) {
			if (e instanceof assert.AssertionError && (e as Error).message.startsWith('Wave 2')) { throw e; }
		} finally {
			spy.restore();
		}
	});

	it('constraint.lift no graph mutation — proposeEdit NOT called across full flow', async () => {
		const spy = spyOn(KernelClient.prototype as object, 'proposeEdit' as keyof object);
		try {
			assert.fail('Wave 2 implements - Plan 16-03 GREEN-flips (KernelClient.constraintLift throw-stub)');
		} catch (e: unknown) {
			if (e instanceof assert.AssertionError && (e as Error).message.startsWith('Wave 2')) { throw e; }
		} finally {
			spy.restore();
		}
	});

	it('constraint.lift no graph mutation — recordRejection NOT called across full flow', async () => {
		const spy = spyOn(KernelClient.prototype as object, 'recordRejection' as keyof object);
		try {
			assert.fail('Wave 2 implements - Plan 16-03 GREEN-flips (KernelClient.constraintLift throw-stub)');
		} catch (e: unknown) {
			if (e instanceof assert.AssertionError && (e as Error).message.startsWith('Wave 2')) { throw e; }
		} finally {
			spy.restore();
		}
	});

	it('constraint.lift no graph mutation — recordContractOverride NOT called across full flow', async () => {
		const spy = spyOn(KernelClient.prototype as object, 'recordContractOverride' as keyof object);
		try {
			assert.fail('Wave 2 implements - Plan 16-03 GREEN-flips (KernelClient.constraintLift throw-stub)');
		} catch (e: unknown) {
			if (e instanceof assert.AssertionError && (e as Error).message.startsWith('Wave 2')) { throw e; }
		} finally {
			spy.restore();
		}
	});

	it('constraint.lift no graph mutation — Attempt count invariant via mocked kernel (DAO-level)', async () => {
		// Wave-0: no real DAO available in unit tests. Wave 2 wires in a minimal mocked kernel
		// that verifies Attempt count before + after a full constraint-lift round-trip (mirrors
		// DEEP-05 Phase 14 Attempt count invariant test).
		assert.fail('Wave 2 implements - Plan 16-03 GREEN-flips (DAO-level Attempt count invariant)');
	});
});
