/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 12 Plan 12-05 — Regression guard for the resolveKernelPath stat-then-fallback resolver
// landed by Phase 8 BRIDGE-RT-01 (closed 2026-05-10; see .planning/REQUIREMENTS.md line 103).
//
// The memory note `project_bridge_kernel_path_bug.md` is STALE — current dist/extension.js
// already contains BOTH the 5-`..` (dev-mode) AND 2-`..` (built-in mirror) candidates. Plan
// 12-05 reduces to a no-op-with-regression-guard plan (verified in 12-00-VERIFY-LOG.md). These
// stubs are the regression sentinels Plan 12-05 will flip GREEN.
//
// Each it() body throws via `assert.fail('NOT IMPLEMENTED — Plan 12-05 Task NN')` so the stubs
// are observably RED until Plan 12-05 wires the static-grep assertion + mocked statSync test.
//
// Wave-0 invariant: the existing 53 bridge mocha tests stay green; only the 2 new it() blocks
// below add to the RED column.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';

// TODO Plan 12-05: import the actual resolveKernelPath export from
// '../../src/extension.js' (named export landed by Phase 8) and read dist/extension.js as a
// string for the static-grep candidate-count assertion. Until then the stubs reference only
// the Stub interface below.
interface Stub {
	readonly note: string;
}

const STUB: Stub = { note: 'Plan 12-05 RED scaffolding — replace assertions with (1) static-grep that dist/extension.js contains BOTH a 5-dot and 2-dot path.resolve(ext, ..., kernel, dist, main.js) candidate, (2) mocked statSync verifying dev-then-builtin probing order.' };

describe('resolve-kernel-path', () => {
	it('static asserts both 5-dot AND 2-dot candidates present in dist', () => {
		// 12-05-01 — read src/vs/goatide/extensions/goatide-bridge/dist/extension.js as a
		// string. Assert it contains BOTH `path.resolve(ext, '..', '..', '..', '..', '..',
		// 'kernel', 'dist', 'main.js')` (dev-mode 5-`..` candidate) AND `path.resolve(ext,
		// '..', '..', 'kernel', 'dist', 'main.js')` (built-in mirror 2-`..` candidate). This is
		// the regression sentinel that prevents the off-by-one from coming back.
		void STUB;
		assert.fail('NOT IMPLEMENTED — Plan 12-05 Task 01');
	});

	it('dev-then-builtin order verified via mocked statSync', () => {
		// 12-05-02 — mock fs.statSync to return success only for the 2-`..` (built-in) path.
		// Assert resolveKernelPath probes the 5-`..` candidate first (throws ENOENT), then
		// falls back to the 2-`..` candidate and returns it. Reverse the mock to assert the
		// 5-`..` candidate is preferred when both exist (dev-mode short-circuit).
		void STUB;
		assert.fail('NOT IMPLEMENTED — Plan 12-05 Task 02');
	});
});
