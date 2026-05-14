/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/inspector/inspector-truncation-banner.test.tsx — Phase 15 Plan 15-04 (Wave 3
// GREEN flip from the Plan 15-01 Wave-0 RED stub).
//
// Renders the TruncationBanner component directly (no jsdom-Cytoscape coupling — the
// banner is a pure React functional component) and asserts the data-testid handle +
// locked copy literal per RESEARCH Open Decision 8. The describe block name is preserved
// verbatim from the Wave-0 stub for VALIDATION.md grep continuity.

import { describe, it, afterEach } from 'mocha';
import { strict as assert } from 'node:assert';
import * as React from 'react';
import { render, cleanup } from '@testing-library/react';
import { TruncationBanner } from '../../../src/inspector/webview/TruncationBanner.js';

describe('inspector truncation banner', () => {
	afterEach(() => cleanup());

	it('renders banner when payload.truncated === true', () => {
		render(React.createElement(TruncationBanner, { count: 2000 }));
		const banner = document.querySelector('[data-testid="inspector-truncation-banner"]');
		assert.ok(banner, 'banner element exists with data-testid="inspector-truncation-banner"');
		assert.ok(
			banner?.textContent?.includes('Showing first'),
			'banner copy must include the literal "Showing first" prefix (RESEARCH Open Decision 8)',
		);
		assert.ok(
			banner?.textContent?.includes('2000'),
			'banner copy must include the displayed node count',
		);
		assert.ok(
			banner?.textContent?.includes('(truncated)'),
			'banner copy must include the "(truncated)" suffix',
		);
	});
});
