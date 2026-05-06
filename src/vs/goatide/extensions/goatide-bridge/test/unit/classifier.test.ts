/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Bridge classifier integration — SUPERSEDED by:
//   - kernel/src/test/canvas/tier-classifier.test.ts (8 passing pure-logic tests for the
//     5-signal ordered guard chain — destructive / high-impact-contract / inferred / explicit /
//     empty)
//   - test/integration/save-gate.test.ts (the CANV-04 / SC #4 inline-tier non-blocking
//     runtime assertion added by Plan 04-09 / W13 gap-closure — proves the bridge wiring of
//     classifier output -> tier-dispatch -> file write for the inline tier)
//
// The 4 stubs that previously lived here referenced classifyTier as an unimplemented
// placeholder. They were Plan-04-01-era stubs that became stale once Plan 04-02 (kernel-side
// classifier) + Plan 04-05 (bridge save-gate wiring) landed. Per Plan 04-09, they are removed
// entirely rather than rewritten — the kernel + integration coverage is sufficient. Adding
// bridge-side unit duplicates of the kernel-side classifier assertions would be redundant.
//
// If a future change to the bridge wiring of classifyTier (e.g., a new signal added at the
// bridge layer) requires bridge-only assertions, add them HERE and remove this comment.

import { describe, it } from 'mocha';

describe('CANV-04 + CANV-08 — bridge classifier integration (SUPERSEDED)', () => {
	it('coverage delegated to kernel/src/test/canvas/tier-classifier.test.ts and integration/save-gate.test.ts', () => {
		// Intentional no-op — see the file header for the full coverage map.
	});
});
