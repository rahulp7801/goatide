/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/helpers/spyOn.ts — Lightweight monkey-patch spy helper.
// Factored from Phase 15 Plan 15-03 command-registration.test.ts pattern.
// Used by Phase 17 RED test files (plans 17-01 through 17-04).
// No sinon dependency — bridge devDependencies do not include sinon.

export interface Spy<TArgs extends unknown[] = unknown[], TReturn = unknown> {
	callCount: number;
	calls: TArgs[];
	/** The last value returned (or thrown) by the replacement. */
	returnValues: TReturn[];
	restore(): void;
}

/**
 * Monkey-patch `target[method]` with an optional replacement, recording every call.
 * If no replacement is provided, the original is still called and its return value recorded.
 * Always call `spy.restore()` in a finally block.
 */
export function spyOn<TTarget extends object, TMethod extends keyof TTarget>(
	target: TTarget,
	method: TMethod,
	replacement?: (...args: unknown[]) => unknown,
): Spy {
	const original = target[method] as (...args: unknown[]) => unknown;
	const spy: Spy = {
		callCount: 0,
		calls: [],
		returnValues: [],
		restore() {
			(target as Record<string | symbol, unknown>)[method as string] = original;
		},
	};
	(target as Record<string | symbol, unknown>)[method as string] = (...args: unknown[]) => {
		spy.callCount++;
		spy.calls.push(args as unknown[]);
		const result = replacement ? replacement(...args) : original.call(target, ...args);
		spy.returnValues.push(result as unknown);
		return result;
	};
	return spy;
}
