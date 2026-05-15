/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/canvas/HypotheticalImpact.test.tsx — Phase 16 Plan 16-01 Task 4.
//
// 3-case jsdom suite for the HypotheticalImpact.tsx component.
// Phase 16 Plan 16-04 GREEN-flips (Wave 3).
// VALIDATION.md task rows 16-00-27..29 grep target: verbatim case-name strings.

import { describe, it, afterEach } from 'mocha';
import { strict as assert } from 'node:assert';
import * as React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { HypotheticalImpact } from '../../../src/canvas/webview/HypotheticalImpact.js';
import type { ComplianceReportForCanvas } from '../../../src/canvas/messages.js';

afterEach(() => { cleanup(); });

function makeRow(nodeId: string, bodyPreview: string, confidenceBand?: string): ComplianceReportForCanvas['definitely_affected'][number] {
	return {
		node_id: nodeId,
		kind: 'DecisionNode',
		hops: 1,
		edge_path: 'parent_of:0',
		body_preview: bodyPreview,
		// confidence_band is a Phase 16 DEEP-03 field on ConstraintLiftRow; cast as any
		// for test purposes — filterRow in HypotheticalImpact.tsx uses it defensively.
		...(confidenceBand !== undefined ? { confidence_band: confidenceBand } : {}),
	} as ComplianceReportForCanvas['definitely_affected'][number];
}

function makeReport(overrides?: Partial<ComplianceReportForCanvas>): ComplianceReportForCanvas {
	return {
		contract_node_id: '01J' + 'A'.repeat(23),
		max_hops: 3,
		definitely_affected: [],
		potentially_affected: [],
		truncated: false,
		generated_at: '2026-05-15T00:00:00Z',
		...overrides,
	};
}

describe('HypotheticalImpact', () => {
	it('HypotheticalImpact renders ComplianceReport body when report prop is non-null', () => {
		const report = makeReport({
			definitely_affected: [makeRow('A', 'explicit-row-body')],
		});
		render(React.createElement(HypotheticalImpact, { report }));
		assert.ok(
			screen.queryByTestId('hypothetical-impact-section') !== null,
			'hypothetical-impact-section should be rendered',
		);
		// ComplianceReportView renders body_preview as text — assert the row appears
		assert.ok(
			screen.queryByText('explicit-row-body') !== null,
			'ComplianceReportView should render the row body_preview',
		);
	});

	it('HypotheticalImpact renders the Hypothetical badge', () => {
		const report = makeReport();
		render(React.createElement(HypotheticalImpact, { report }));
		const badge = screen.queryByTestId('hypothetical-impact-badge');
		assert.ok(badge !== null, 'badge element should be present');
		assert.ok(badge!.textContent === 'Hypothetical', `badge text should be 'Hypothetical', got: ${badge!.textContent}`);
	});

	it('HypotheticalImpact show all toggle reveals Inferred-confidence rows', () => {
		const report = makeReport({
			definitely_affected: [
				makeRow('A', 'explicit-row', 'explicit'),
				makeRow('B', 'inferred-row', 'inferred'),
			],
		});

		// Default showAll=false — inferred row should be filtered out
		const { rerender } = render(React.createElement(HypotheticalImpact, { report, showAll: false }));
		assert.ok(
			screen.queryByText('explicit-row') !== null,
			'explicit row should be visible when showAll=false',
		);
		assert.ok(
			screen.queryByText('inferred-row') === null,
			'inferred row should be hidden when showAll=false',
		);

		// showAll=true — both rows should be visible
		rerender(React.createElement(HypotheticalImpact, { report, showAll: true }));
		assert.ok(
			screen.queryByText('explicit-row') !== null,
			'explicit row should still be visible when showAll=true',
		);
		assert.ok(
			screen.queryByText('inferred-row') !== null,
			'inferred row should be visible when showAll=true',
		);
	});
});
