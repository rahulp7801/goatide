/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/canvas/HypotheticalImpact.test.tsx — Phase 16 Plan 16-01 Task 4.
//
// 3-case RED jsdom suite for the HypotheticalImpact.tsx component.
// RED at Wave-0 close — HypotheticalImpact stub returns null (Wave 3 — Plan 16-04 GREEN-flips).
// VALIDATION.md task rows 16-00-27..29 grep target: verbatim case-name strings.

import { describe, it, afterEach } from 'mocha';
import { strict as assert } from 'node:assert';
import * as React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { HypotheticalImpact } from '../../../src/canvas/webview/HypotheticalImpact.js';
import type { ComplianceReportForCanvas } from '../../../src/canvas/messages.js';

afterEach(() => { cleanup(); });

function makeReport(overrides?: Partial<ComplianceReportForCanvas>): ComplianceReportForCanvas {
	return {
		contract_node_id: '01J' + 'A'.repeat(23),
		definitely_affected: [],
		potentially_affected: [],
		truncated: false,
		nodeCap: 1000,
		...overrides,
	};
}

describe('HypotheticalImpact', () => {
	it('HypotheticalImpact renders ComplianceReport body when report prop is non-null', () => {
		// Wave-0: HypotheticalImpact stub returns null — renders nothing.
		// Wave 3 (Plan 16-04) GREEN-flips by implementing the full ComplianceReport.tsx wrapper.
		const { container } = render(React.createElement(HypotheticalImpact, { report: makeReport() }));
		// At Wave-0, the stub returns null → container is empty. Wave 3 asserts ComplianceReport rendered.
		assert.fail('Wave 3 implements - Plan 16-04 GREEN-flips (HypotheticalImpact ComplianceReport render)');
	});

	it('HypotheticalImpact renders the Hypothetical badge', () => {
		// Wave-0: stub returns null → no badge rendered.
		// Wave 3 (Plan 16-04) GREEN-flips by rendering a "Hypothetical" badge element.
		render(React.createElement(HypotheticalImpact, { report: makeReport() }));
		assert.fail('Wave 3 implements - Plan 16-04 GREEN-flips (HypotheticalImpact Hypothetical badge)');
	});

	it('HypotheticalImpact show all toggle reveals Inferred-confidence rows', () => {
		// Wave-0: stub returns null → no toggle.
		// Wave 3 (Plan 16-04) GREEN-flips by implementing the show-all toggle for Inferred rows.
		render(React.createElement(HypotheticalImpact, { report: makeReport() }));
		assert.fail('Wave 3 implements - Plan 16-04 GREEN-flips (HypotheticalImpact show-all toggle)');
	});
});
