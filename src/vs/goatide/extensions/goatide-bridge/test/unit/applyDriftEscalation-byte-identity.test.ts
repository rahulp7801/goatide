/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/applyDriftEscalation-byte-identity.test.ts — Phase 14 Plan 14-03 (DEEP-04 / Mandate D).
//
// Mandate D states: the historical-conflict IntentDriftBadge variant INFORMS the developer
// but does NOT block save. Tier escalation flows ONLY through driftFindings + lockTrigger.
// Adding a historical-conflict badge to a citation MUST NOT introduce any new escalation
// code path through applyDriftEscalation.
//
// This regression test pins three structural invariants:
//
//   1. arity fence — `applyDriftEscalation.length === 3`. The signature is
//      `(tier, driftFindings, lockTrigger) => CanvasTier`. A 4th parameter (for example a
//      badges array) is forbidden.
//
//   2. snapshot — the (baseTier, lockTriggerPresent) × {silent | inline | modal} matrix
//      returns exactly the Phase-7 tier values. Encoded as a single snapshot-style deep-
//      equal per CLAUDE.md ## Learnings (minimize assertions). Any drift in escalation
//      semantics breaks the snapshot.
//
//   3. caller-search fence — `grep -RE "applyDriftEscalation" src/.../bridge/src/`
//      returns exactly 2 hits (definition at tier-dispatch.ts + the single call site in
//      dispatchTier). A new production caller will trip this. SCOPING NOTE: the grep is
//      restricted to `src/` ONLY (NOT `test/`). This file imports applyDriftEscalation —
//      that's a test caller, intentionally excluded from the Pitfall 2 production-caller
//      fence.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import * as childProcess from 'node:child_process';
import * as path from 'node:path';
import { applyDriftEscalation } from '../../src/save-gate/tier-dispatch.js';
import type { CanvasTier } from '../../src/save-gate/canvas-module.js';
import type { DriftFinding, LockTrigger } from '../../src/kernel/methods.js';

describe('applyDriftEscalation unchanged for historical-conflict', () => {
	it('arity is exactly 3 — signature (tier, driftFindings, lockTrigger) is frozen', () => {
		assert.strictEqual(
			applyDriftEscalation.length,
			3,
			'Mandate D: applyDriftEscalation signature must remain 3-arity. A 4th parameter (e.g. badges array) would imply a new escalation path routing badge state into tier dispatch — forbidden.',
		);
	});

	it('snapshot — (baseTier, driftFindings, lockTrigger) → expected tier matrix matches Phase-7 behavior', () => {
		// Build the full (baseTier × lockTriggerPresent × driftFindingsPresent) matrix.
		// Encoded values mirror tier-dispatch.ts:76-88 (the Phase-7 escalation rules):
		//   - lockTrigger non-null  → 'modal' (forced; no demotion)
		//   - driftFindings.length>0 AND tier==='silent' → 'inline' (escalate from silent only)
		//   - else → tier (unchanged)

		const lockTrigger: LockTrigger = {
			contract_node_id: '01' + 'L'.repeat(24),
			contract_anchor_file: '/contracts/security/auth.md',
			section_name: 'Authentication',
			edited_line_range: [7, 9] as const,
			hunk_index: 0,
		};

		const driftFinding: DriftFinding = {
			contract_node_id: '01' + 'C'.repeat(24),
			contract_anchor_file: '/contracts/security/auth.md',
			pattern_index: 0,
			pattern_kind: 'forbidden_import',
			file: 'src/utils/foo.ts',
			hunk_line: 12,
			message: 'forbidden_import',
		};

		const baseTiers: readonly CanvasTier[] = ['silent', 'inline', 'modal'];
		const actual: Record<string, CanvasTier> = {};
		for (const t of baseTiers) {
			actual[`${t}__no-drift__no-lock`] = applyDriftEscalation(t, [], null);
			actual[`${t}__no-drift__no-lock__undef`] = applyDriftEscalation(t, undefined, undefined);
			actual[`${t}__drift__no-lock`] = applyDriftEscalation(t, [driftFinding], null);
			actual[`${t}__no-drift__lock`] = applyDriftEscalation(t, [], lockTrigger);
			actual[`${t}__drift__lock`] = applyDriftEscalation(t, [driftFinding], lockTrigger);
		}

		const expected: Record<string, CanvasTier> = {
			// silent base — no drift / no lock → silent (unchanged)
			'silent__no-drift__no-lock': 'silent',
			'silent__no-drift__no-lock__undef': 'silent',
			// silent + drift findings (no lock) → escalate to inline (Phase-7 SC #4)
			'silent__drift__no-lock': 'inline',
			// lock always forces modal regardless of base
			'silent__no-drift__lock': 'modal',
			'silent__drift__lock': 'modal',

			// inline base — no drift / no lock → inline (unchanged); drift does NOT escalate
			// inline → modal (Phase-7 SC #4 escalates silent→inline only; modal escalations
			// come from lockTrigger).
			'inline__no-drift__no-lock': 'inline',
			'inline__no-drift__no-lock__undef': 'inline',
			'inline__drift__no-lock': 'inline',
			'inline__no-drift__lock': 'modal',
			'inline__drift__lock': 'modal',

			// modal base — stays modal in all branches (no demotion).
			'modal__no-drift__no-lock': 'modal',
			'modal__no-drift__no-lock__undef': 'modal',
			'modal__drift__no-lock': 'modal',
			'modal__no-drift__lock': 'modal',
			'modal__drift__lock': 'modal',
		};

		assert.deepStrictEqual(
			actual,
			expected,
			'Mandate D byte-identity: every (baseTier × driftFindings × lockTrigger) combination must return the Phase-7 escalation value. Drift in this table = new escalation path = Mandate D violation.',
		);
	});

	it('caller-search fence — applyDriftEscalation has exactly 2 hits in bridge src/ (definition + dispatchTier call site)', () => {
		// SCOPING: this grep is restricted to `src/` ONLY. The byte-identity test itself
		// (this file, under `test/`) is a TEST caller — intentionally excluded from the
		// Pitfall 2 fence which targets production code paths. Anyone who imports
		// applyDriftEscalation from a NEW Phase-14 production file (e.g., a hypothetical
		// RationaleChain.tsx host handler) will trip this assertion.
		const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', '..');
		const target = path.join(repoRoot, 'src', 'vs', 'goatide', 'extensions', 'goatide-bridge', 'src');

		// Use git's grep so the matcher is portable across Windows/macOS/Linux. We invoke
		// `git grep -E "applyDriftEscalation" -- src/...` from the repo root.
		const raw = childProcess.execSync(
			'git grep -nE "applyDriftEscalation" -- src/vs/goatide/extensions/goatide-bridge/src/',
			{ cwd: repoRoot, encoding: 'utf8' },
		);
		const lines = raw.split('\n').filter((l) => l.trim().length > 0);
		// Defensive: also confirm every reported hit is under src/save-gate/tier-dispatch.ts
		// (the single allowed file for the symbol). A new file emerging in the grep results
		// is exactly what this fence catches.
		const distinctFiles = new Set(lines.map((l) => l.split(':')[0]));
		assert.strictEqual(
			lines.length,
			2,
			`Mandate D Pitfall 2 fence: applyDriftEscalation must have exactly 2 src/ hits (definition + single call site at tier-dispatch.ts). Got ${lines.length}:\n${raw}\nA new production caller in Phase 14 would trip this — the historical-conflict badge must never reach tier dispatch.\nFile path: ${target}`,
		);
		assert.strictEqual(
			distinctFiles.size,
			1,
			`Mandate D Pitfall 2 fence: all 2 hits must be in the same file (src/save-gate/tier-dispatch.ts). Got ${distinctFiles.size} distinct files:\n${[...distinctFiles].join('\n')}`,
		);
	});
});
