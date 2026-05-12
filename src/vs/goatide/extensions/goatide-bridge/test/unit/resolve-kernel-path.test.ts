/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Plan 12-05 — Regression guard for BRIDGE-RT-01 closure.
 *
 * Phase 8 BRIDGE-RT-01 (closed 2026-05-10; see .planning/REQUIREMENTS.md line 103) replaced
 * the original hardcoded 4-`..` literal in `dist/extension.js:66` with a stat-then-fallback
 * resolver that probes BOTH a 5-`..` (dev-mode) AND a 2-`..` (built-in mirror) candidate
 * and returns whichever exists on disk. The memory note `project_bridge_kernel_path_bug.md`
 * (describing the OLD off-by-one) is STALE — confirmed in
 * `.planning/phases/12-robustness-hardening/12-00-VERIFY-LOG.md` with verbatim
 * `dist/extension.js:79-99` block.
 *
 * These tests fail red if either candidate is removed in the future. They read the compiled
 * `extensions/goatide-bridge/dist/extension.js` (the actual runtime artifact under built-in
 * mode) rather than `src/extension.ts`, because the regression sentinel must catch BOTH a
 * source edit AND a stale-mirror-after-source-edit regression. The two dist mirrors
 * (`extensions/goatide-bridge/dist/extension.js` and
 * `src/vs/goatide/extensions/goatide-bridge/dist/extension.js`) are kept byte-equal by
 * `scripts/prepare_goatide.sh` per Plan 12-04 — Wave-2 mirror byte-equality fence.
 *
 * See .planning/phases/12-robustness-hardening/12-00-VERIFY-LOG.md for the refutation
 * evidence.
 */

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

// __dirname for this test file is
// `<root>/src/vs/goatide/extensions/goatide-bridge/test/unit`. Seven `..` walk back to
// `<root>` (unit → test → goatide-bridge → extensions → goatide → vs → src → <root>).
// The built-in dist mirror sits at `<root>/extensions/goatide-bridge/dist/extension.js`.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', '..');
const DIST_PATH = path.join(REPO_ROOT, 'extensions', 'goatide-bridge', 'dist', 'extension.js');

// Regexes anchor at `path.resolve(<arg>,` so they cannot accidentally match each other's
// subsequences (the trailing `'..', '..'` of the 5-dot candidate is structurally identical
// to the leading `'..', '..'` of the 2-dot candidate; without a hard anchor the 2-dot
// regex would match inside the 5-dot string and the presence assertion would lose its
// discriminating power).
//
// `\w+` matches the bridge's `ext` local — robust against future renames like `extPath`.
// `\s*` tolerates whitespace variations introduced by future TypeScript/Webpack reformats.
// Each `..` is matched as `['"]\s*\.\.\s*['"]` (a quoted `..` token), and `,` between
// tokens permits surrounding whitespace.
const FIVE_DOT_REGEX = /path\.resolve\s*\(\s*\w+\s*,\s*['"]\s*\.\.\s*['"]\s*,\s*['"]\s*\.\.\s*['"]\s*,\s*['"]\s*\.\.\s*['"]\s*,\s*['"]\s*\.\.\s*['"]\s*,\s*['"]\s*\.\.\s*['"]\s*,\s*['"]kernel['"]/;
const TWO_DOT_REGEX = /path\.resolve\s*\(\s*\w+\s*,\s*['"]\s*\.\.\s*['"]\s*,\s*['"]\s*\.\.\s*['"]\s*,\s*['"]kernel['"]/;

describe('resolve-kernel-path', () => {
	it('static asserts both 5-dot AND 2-dot candidates present in dist', () => {
		// 12-05-01 — Regression sentinel for BRIDGE-RT-01. Reads the canonical built-in dist
		// mirror at `extensions/goatide-bridge/dist/extension.js` and asserts that BOTH the
		// 5-`..` (dev-mode) and 2-`..` (built-in mirror) path.resolve candidates remain
		// present. If either is removed in the future this assertion fails red with a
		// message naming Phase 8 BRIDGE-RT-01 and pointing at the verify-log path.
		const distSource = fs.readFileSync(DIST_PATH, 'utf8');

		assert.deepStrictEqual(
			{
				fiveDotPresent: FIVE_DOT_REGEX.test(distSource),
				twoDotPresent: TWO_DOT_REGEX.test(distSource),
			},
			{
				fiveDotPresent: true,
				twoDotPresent: true,
			},
			'BRIDGE-RT-01 regression: dist/extension.js must contain BOTH the 5-`..` (dev-mode) AND 2-`..` (built-in mirror) path.resolve candidates in resolveKernelPath. See .planning/phases/12-robustness-hardening/12-00-VERIFY-LOG.md for the verbatim block this test guards.',
		);
	});

	it('dev-then-builtin order verified via mocked statSync', () => {
		// 12-05-02 — Plan 12-05 Task 02 (next commit). Stub remains RED until the ordering
		// assertion lands.
		assert.fail('NOT IMPLEMENTED — Plan 12-05 Task 02');
	});
});
