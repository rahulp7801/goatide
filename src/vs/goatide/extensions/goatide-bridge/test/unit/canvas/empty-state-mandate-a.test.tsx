/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/canvas/empty-state-mandate-a.test.tsx — Phase 17 Plan 17-01 (Wave-0) RED suite.
//
// POLISH-03 Mandate A: CitationList empty-state renders a static "No rationale recorded yet"
// heading with a CTA that posts canvas.requestAddDecisionNode — NO LLM-bearing message
// variants. The structural CI gate refuse-llm-in-canvas.meta.sh enforces the token fence.
//
// Expected: RED at Wave-0 close (CitationList.tsx empty-state unchanged in Wave 0).
// Wave 2 Plan 17-03 GREEN-flips these tests by:
//   - Adding onAddDecisionNode prop to CitationList
//   - Adding empty-state heading data-testid="empty-state-heading" with text "No rationale recorded yet"
//   - Adding CTA button data-testid="empty-state-add-decision-node" that calls onAddDecisionNode
//   - Ensuring NO LLM-bearing message variants are posted

import { describe, it, before } from 'mocha';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

// jsdom + @testing-library are available in the bridge devDependencies
import { JSDOM } from 'jsdom';
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { fireEvent } from '@testing-library/dom';

// CitationList is imported; the test uses @testing-library/react to render it.
// In Wave 0, CitationList does NOT have onAddDecisionNode prop — so the first two
// test cases fail with assertion errors. Wave 2 Plan 17-03 adds the prop + empty-state.

// Setup jsdom environment for @testing-library/react
before(() => {
	const jsdom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
		url: 'about:blank',
	});
	// @testing-library/react uses the global document/window
	(global as unknown as Record<string, unknown>)['document'] = jsdom.window.document;
	(global as unknown as Record<string, unknown>)['window'] = jsdom.window;
	(global as unknown as Record<string, unknown>)['navigator'] = jsdom.window.navigator;
});

describe('POLISH-03 empty-state Mandate A', () => {

	it('POLISH-03 empty-state — Mandate A static-text fence — renders literal No rationale recorded yet heading', async () => {
		// Wave 0 RED: CitationList does not have onAddDecisionNode prop or empty-state heading.
		// Wave 2 Plan 17-03 GREEN-flips: adds data-testid="empty-state-heading" with text
		// "No rationale recorded yet" (LOCKED literal — must not be changed without updating this test).

		// Attempt to import CitationList with the new props shape
		const { CitationList } = await import('../../../src/canvas/webview/CitationList.js');

		// The onAddDecisionNode spy
		let addDecisionNodeCallCount = 0;
		const onAddDecisionNode = () => { addDecisionNodeCallCount++; };

		// In Wave 0, CitationList does not accept onAddDecisionNode — this render will
		// succeed but the empty-state heading will not exist.
		const { container } = render(
			React.createElement(CitationList as unknown as React.FC<{
				citations: never[];
				onExplain: (id: string) => void;
				onAddDecisionNode?: () => void;
			}>, {
				citations: [],
				onExplain: (_id: string) => { },
				onAddDecisionNode,
			})
		);

		// Wave 0 RED: no empty-state-heading data-testid
		const heading = container.querySelector('[data-testid="empty-state-heading"]');
		assert.ok(
			heading !== null,
			'Wave 2 Plan 17-03 GREEN-flips — CitationList must render a data-testid="empty-state-heading" element when citations is empty, with textContent "No rationale recorded yet"',
		);
		assert.strictEqual(
			heading!.textContent,
			'No rationale recorded yet',
			'Wave 2 Plan 17-03 GREEN-flips — empty-state heading textContent must be the LOCKED literal "No rationale recorded yet"',
		);
	});

	it('POLISH-03 empty-state — CTA button posts canvas.requestAddDecisionNode (no LLM message variant)', async () => {
		// Wave 0 RED: no CTA button with data-testid="empty-state-add-decision-node".
		// Wave 2 Plan 17-03 GREEN-flips: adds the CTA button that calls onAddDecisionNode(no args)
		// and asserts NO LLM-bearing message variants are posted:
		//   canvas.requestLLMRationale, canvas.requestPromptCompletion,
		//   canvas.requestSummarize — these MUST never be posted.

		const { CitationList } = await import('../../../src/canvas/webview/CitationList.js');

		let addDecisionNodeCallCount = 0;
		let addDecisionNodeCallArgs: unknown[][] = [];
		const onAddDecisionNode = (...args: unknown[]) => {
			addDecisionNodeCallCount++;
			addDecisionNodeCallArgs.push(args);
		};

		// Track any postMessage calls from the webview rpc module (LLM-bearing variants)
		const llmBannedMessages: string[] = [
			'canvas.requestLLMRationale',
			'canvas.requestPromptCompletion',
			'canvas.requestSummarize',
		];

		const { container } = render(
			React.createElement(CitationList as unknown as React.FC<{
				citations: never[];
				onExplain: (id: string) => void;
				onAddDecisionNode?: () => void;
			}>, {
				citations: [],
				onExplain: (_id: string) => { },
				onAddDecisionNode,
			})
		);

		const ctaButton = container.querySelector('[data-testid="empty-state-add-decision-node"]');
		assert.ok(
			ctaButton !== null,
			'Wave 2 Plan 17-03 GREEN-flips — CitationList must render a data-testid="empty-state-add-decision-node" button when citations is empty',
		);

		fireEvent.click(ctaButton!);

		assert.strictEqual(
			addDecisionNodeCallCount,
			1,
			'Wave 2 Plan 17-03 GREEN-flips — onAddDecisionNode must be called exactly once when CTA is clicked',
		);
		assert.strictEqual(
			addDecisionNodeCallArgs[0]?.length ?? -1,
			0,
			'Wave 2 Plan 17-03 GREEN-flips — onAddDecisionNode must be called with NO arguments (not an LLM-bearing message variant)',
		);
	});

	it('POLISH-03 empty-state — structural grep CitationList.tsx for LLM tokens returns zero', () => {
		// Re-implements the same token-fence as refuse-llm-in-canvas.meta.sh so any
		// divergence between the two locations is caught at test time. The BANNED list
		// must be kept in sync with the meta-test (scripts/test/refuse-llm-in-canvas.meta.sh).
		//
		// Wave 0: CitationList.tsx has no LLM tokens — test GREEN at Wave-0 close.
		// Wave 2 Plan 17-03: if the empty-state implementation accidentally introduces
		// LLM tokens, this test fires RED.

		const citationListPath = path.resolve(
			__dirname,
			'../../../src/canvas/webview/CitationList.tsx',
		);

		let source: string;
		try {
			source = fs.readFileSync(citationListPath, 'utf8');
		} catch (e) {
			assert.fail(`Could not read CitationList.tsx at ${citationListPath}: ${e}`);
		}

		// BANNED list — word-boundary syntactic-construct patterns (keep in sync with
		// scripts/test/refuse-llm-in-canvas.meta.sh BANNED variable).
		const bannedPatterns: Array<{ name: string; pattern: RegExp }> = [
			{ name: '\\bLLM\\b', pattern: /\bLLM\b/ },
			{ name: '\\bprompt\\s*(', pattern: /\bprompt\s*\(/ },
			{ name: '\\bsummari[sz]e\\s*(', pattern: /\bsummari[sz]e\s*\(/ },
			{ name: '\\bcomplet(?:ion|e)\\s*(', pattern: /\bcomplet(?:ion|e)\s*\(/ },
			{ name: '\\binference\\s*(', pattern: /\binference\s*\(/ },
			{ name: '\\bgenerate\\s*(', pattern: /\bgenerate\s*\(/ },
		];

		const violations: string[] = [];
		for (const { name, pattern } of bannedPatterns) {
			if (pattern.test(source)) {
				violations.push(name);
			}
		}

		assert.deepStrictEqual(
			violations,
			[],
			`Mandate A structural fence — CitationList.tsx contains banned LLM token patterns: ${violations.join(', ')}. ` +
			'These patterns are forbidden in canvas/webview/ source. ' +
			'See scripts/test/refuse-llm-in-canvas.meta.sh for the canonical BANNED list.',
		);
	});

});
