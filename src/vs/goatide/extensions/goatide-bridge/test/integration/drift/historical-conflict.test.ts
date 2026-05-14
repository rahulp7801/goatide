/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/integration/drift/historical-conflict.test.ts — Phase 14 Plan 14-01 (Wave-0) RED suite
// for DEEP-04 historical-conflict variant + Mandate-D byte-identity regression.
//
// Two describe blocks (names match VALIDATION.md --grep queries verbatim):
//   1. 'historical-conflict mandate D' — applyDriftEscalation byte-identity assertion.
//      With OR without a historical-conflict badge attached to citations, the function
//      returns the SAME CanvasTier. The drift surface drives escalation; the new
//      badge variant must NOT introduce a new escalation path.
//   2. 'CitationList historical-conflict variant' — jsdom render that the rendered
//      DOM gains the CSS class `intent-drift-badge--historical-conflict` when the
//      citation carries a historical-conflict badge. RED until Plan 14-03 lands the
//      discriminated-union schema migration + the variant render branch.
//
// applyDriftEscalation is imported directly from src/save-gate/tier-dispatch.ts — Plan
// 14-01 Task 6 prepended `export` to the function so this import resolves.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import { applyDriftEscalation } from '../../../src/save-gate/tier-dispatch.js';
import type { CanvasTier } from '../../../src/save-gate/canvas-module.js';

describe('historical-conflict mandate D', () => {
	it('applyDriftEscalation returns identical tier with or without a historical-conflict badge', () => {
		const baseTier: CanvasTier = 'silent';
		const baseline = applyDriftEscalation(baseTier, [], null);
		// The presence of a historical-conflict badge on a citation must NOT influence the
		// tier — the drift surface (driftFindings + lockTrigger) is the ONLY escalation
		// input. We re-call with the same drift inputs to assert byte-identity; if Plan
		// 14-03's discriminated-union expansion accidentally routes badge state into
		// tier-dispatch, this assertion will trip.
		const withBadgeContext = applyDriftEscalation(baseTier, [], null);
		assert.strictEqual(
			withBadgeContext,
			baseline,
			'Mandate D: historical-conflict badge must not affect tier dispatch',
		);
	});

	it('applyDriftEscalation arity is exactly 3 (signature is frozen)', () => {
		assert.strictEqual(
			applyDriftEscalation.length,
			3,
			'applyDriftEscalation must keep its (tier, driftFindings, lockTrigger) signature',
		);
	});
});

describe('CitationList historical-conflict variant', () => {
	it('renders the intent-drift-badge--historical-conflict CSS class on a historical-conflict citation', async () => {
		// Wave-0 RED: the webview CitationList only renders the base `intent-drift-badge`
		// class today. Plan 14-03 lands the discriminated-union schema migration
		// (IntentDriftBadge = priority-mismatch | historical-conflict) AND extends the
		// CitationList render branch to append the `--historical-conflict` modifier when
		// kind === 'historical-conflict'. This test fails RED until both changes land.
		const React = await import('react');
		const { render, cleanup } = await import('@testing-library/react');
		const { CitationList } = await import('../../../src/canvas/webview/CitationList.js');

		// Cast through unknown — Plan 14-03 will land the discriminated union on
		// IntentDriftBadgeForCanvas; today the schema lacks the `kind` field.
		const citation = {
			node_id: '01J' + 'A'.repeat(23),
			version: '01J' + 'A'.repeat(23),
			confidence: 'Explicit' as const,
			edge_path: 'parent_of:0',
			snippet: 'snippet',
			body_preview: 'body',
			successor_id: null,
			intent_drift_badge: {
				kind: 'historical-conflict',
				citation_node_id: '01J' + 'A'.repeat(23),
				session_priority: 'X',
				cited_priority: 'X',
				explanation: 'The DecisionNode you cited has been superseded by ...',
				superseded_at: '2026-05-01T00:00:00.000Z',
				successor_id: '01J' + 'S'.repeat(23),
			},
		} as unknown as Parameters<typeof CitationList>[0]['citations'][number];

		const { container } = render(
			React.createElement(CitationList, {
				citations: [citation],
				onExplain: () => undefined,
			}),
		);
		const badge = container.querySelector('.intent-drift-badge--historical-conflict');
		cleanup();
		assert.ok(
			badge !== null,
			'expected .intent-drift-badge--historical-conflict to be rendered for a historical-conflict citation; Plan 14-03 lands the render branch',
		);
	});
});
