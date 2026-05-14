/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/test/integration/drift/drift-flow.test.ts
//
// Phase 7 Plan 07-07 — bridge drift-flow integration. Plan 07-01 staged 3 it.skip stubs;
// Plan 07-07 flips them to live tests + adds 3 NEW tests covering the full drift surface
// (override flow, empty-note rejection, Promise.race timeout pattern).
//
// All tests render the canvas React surface under jsdom + @testing-library/react and
// drive the wire shape via direct HostToWebview message dispatches (no live kernel
// subprocess — the kernel-side handlers are exercised in kernel/src/test/drift/rpc.spec.ts).
// This keeps the bridge integration scope to: (a) does the React layer render the new
// components correctly when given drift_findings / compliance_report / lock_trigger fields,
// and (b) does the override + reveal_line postMessage flow round-trip cleanly.

import { describe, it, afterEach } from 'mocha';
import { strict as assert } from 'node:assert';
import * as React from 'react';
import { act, render, screen, fireEvent, cleanup } from '@testing-library/react';
import { App } from '../../../src/canvas/webview/App.js';
import { WebviewRpc, type VsCodeApi } from '../../../src/canvas/rpc.js';
import type { CanvasShowPayload, HostToWebview } from '../../../src/canvas/messages.js';

const FIXED_CHANGE_ID = '01J' + 'X'.repeat(23);
const FIXED_CONTRACT_ID = '01J' + 'C'.repeat(23);
const FIXED_NODE_ID = '01J' + 'N'.repeat(23);

function makeShowPayload(opts?: Partial<CanvasShowPayload>): CanvasShowPayload {
	return {
		change_id: FIXED_CHANGE_ID,
		tier: 'modal',
		destructive: false,
		confirmation_phrase: null,
		file_uri: 'src/auth.ts',
		language: 'typescript',
		original_content: 'const a = 1;',
		modified_content: 'const a = 2;',
		citations: [],
		drill_chain: [],
		...opts,
	};
}

function makeStubVsCodeApi(): { api: VsCodeApi; sent: unknown[] } {
	const sent: unknown[] = [];
	const api: VsCodeApi = {
		postMessage: (m: unknown) => { sent.push(m); },
		getState: () => null,
		setState: () => { /* noop */ },
	};
	return { api, sent };
}

const StubDiff = ({ language }: { original: string; modified: string; language: string }) =>
	React.createElement('div', { 'data-testid': 'diff-mock', 'data-language': language }, 'DIFF MOCK');

function dispatchHostMessage(msg: HostToWebview): void {
	window.dispatchEvent(new MessageEvent('message', { data: msg }));
}

describe('Phase 7 Plan 07-07 — bridge drift-flow integration (SC #1 + SC #3 + SC #5)', () => {
	afterEach(() => cleanup());

	it('sidebar drift finding renders for pattern violation (DRIFT-01)', async () => {
		const { api } = makeStubVsCodeApi();
		const rpc = new WebviewRpc(api);
		render(React.createElement(App, { rpc, DiffComponent: StubDiff }));

		const payload = makeShowPayload({
			drift_findings: [
				{
					contract_node_id: FIXED_CONTRACT_ID,
					contract_anchor_file: '/contracts/dependency_rules.md',
					pattern_index: 0,
					pattern_kind: 'forbidden_import',
					file: 'src/utils/match.ts',
					hunk_line: 12,
					message: 'forbidden_import string-similarity detected on src/utils/match.ts:12',
				},
			],
			lock_trigger: null,
		});

		await act(async () => {
			dispatchHostMessage({ type: 'canvas.show', payload });
		});

		const driftSection = screen.getByTestId('drift-findings');
		assert.ok(driftSection, 'DriftFindings section rendered');
		const rows = screen.getAllByTestId('drift-finding-row');
		assert.equal(rows.length, 1);
		assert.match(driftSection.textContent ?? '', /forbidden_import/);
		assert.match(driftSection.textContent ?? '', /src\/utils\/match\.ts:12/);
	});

	it('modal lock with tri-bucket compliance report renders for enforcing-section edit (DRIFT-03 + DRIFT-04)', async () => {
		const { api } = makeStubVsCodeApi();
		const rpc = new WebviewRpc(api);
		render(React.createElement(App, { rpc, DiffComponent: StubDiff }));

		const payload = makeShowPayload({
			drift_findings: [],
			lock_trigger: {
				contract_node_id: FIXED_CONTRACT_ID,
				contract_anchor_file: '/contracts/api_security.md',
				section_name: 'Authentication',
				edited_line_range: [7, 9],
				hunk_index: 0,
			},
			compliance_report: {
				contract_node_id: FIXED_CONTRACT_ID,
				max_hops: 3,
				definitely_affected: [
					{ node_id: '01JD' + 'A'.repeat(22), kind: 'ContractNode', edge_path: '/protects:0', hops: 1, body_preview: 'auth required' },
					{ node_id: '01JD' + 'B'.repeat(22), kind: 'DecisionNode', edge_path: '/protects:1', hops: 2, body_preview: 'use bcrypt' },
				],
				potentially_affected: [
					{ node_id: '01JD' + 'C'.repeat(22), kind: 'ConstraintNode', edge_path: '/references:0', hops: 1, body_preview: 'rotation 30d' },
				],
				truncated: false,
				generated_at: new Date().toISOString(),
			},
		});

		await act(async () => {
			dispatchHostMessage({ type: 'canvas.show', payload });
		});

		const complianceSection = screen.getByTestId('compliance-report');
		assert.ok(complianceSection, 'ComplianceReport section rendered');
		const definitely = screen.getByTestId('bucket-definitely');
		const potentially = screen.getByTestId('bucket-potentially');
		assert.match(definitely.textContent ?? '', /Definitely Affected \(2\)/);
		assert.match(potentially.textContent ?? '', /Potentially Affected \(1\)/);
	});

	it('progressive disclosure: deeper hops merge into report after initial paint (DRIFT-05)', async () => {
		const { api } = makeStubVsCodeApi();
		const rpc = new WebviewRpc(api);
		render(React.createElement(App, { rpc, DiffComponent: StubDiff }));

		// First paint: hop=1 partial only.
		const partialPayload = makeShowPayload({
			lock_trigger: {
				contract_node_id: FIXED_CONTRACT_ID,
				contract_anchor_file: '/contracts/api_security.md',
				section_name: 'Authentication',
				edited_line_range: [7, 9],
				hunk_index: 0,
			},
			compliance_report: {
				contract_node_id: FIXED_CONTRACT_ID,
				max_hops: 1,
				definitely_affected: [
					{ node_id: '01JE' + 'A'.repeat(22), kind: 'ContractNode', edge_path: '/protects:0', hops: 1, body_preview: 'first-degree' },
				],
				potentially_affected: [],
				truncated: false,
				generated_at: new Date().toISOString(),
			},
		});

		await act(async () => {
			dispatchHostMessage({ type: 'canvas.show', payload: partialPayload });
		});

		const initialBucket = screen.getByTestId('bucket-definitely');
		assert.match(initialBucket.textContent ?? '', /Definitely Affected \(1\)/);

		// Loading deeper hops indicator should be present (max_hops < 3).
		assert.ok(screen.getByTestId('compliance-report-loading'), 'loading indicator present during partial');

		// Async update: send compliance_report.full with the maxHops=3 result.
		await act(async () => {
			dispatchHostMessage({
				type: 'compliance_report.full',
				payload: {
					report: {
						contract_node_id: FIXED_CONTRACT_ID,
						max_hops: 3,
						definitely_affected: [
							{ node_id: '01JE' + 'A'.repeat(22), kind: 'ContractNode', edge_path: '/protects:0', hops: 1, body_preview: 'first-degree' },
							{ node_id: '01JE' + 'B'.repeat(22), kind: 'DecisionNode', edge_path: '/protects:1', hops: 2, body_preview: 'second-degree' },
							{ node_id: '01JE' + 'C'.repeat(22), kind: 'ConstraintNode', edge_path: '/protects:2', hops: 3, body_preview: 'third-degree' },
						],
						potentially_affected: [],
						truncated: false,
						generated_at: new Date().toISOString(),
					},
				},
			});
		});

		const mergedBucket = screen.getByTestId('bucket-definitely');
		assert.match(mergedBucket.textContent ?? '', /Definitely Affected \(3\)/);
		assert.equal(screen.queryByTestId('compliance-report-loading'), null, 'loading indicator removed after full report arrived');
	});

	it('override flow end-to-end — empty note rejected client-side; valid note posts record_override message', async () => {
		const { api, sent } = makeStubVsCodeApi();
		const rpc = new WebviewRpc(api);
		render(React.createElement(App, { rpc, DiffComponent: StubDiff }));

		const payload = makeShowPayload({
			lock_trigger: {
				contract_node_id: FIXED_CONTRACT_ID,
				contract_anchor_file: '/contracts/api_security.md',
				section_name: 'Authentication',
				edited_line_range: [7, 9],
				hunk_index: 0,
			},
			compliance_report: {
				contract_node_id: FIXED_CONTRACT_ID,
				max_hops: 3,
				definitely_affected: [],
				potentially_affected: [],
				truncated: false,
				generated_at: new Date().toISOString(),
			},
		});

		await act(async () => {
			dispatchHostMessage({ type: 'canvas.show', payload });
		});

		const submit = screen.getByTestId('override-submit') as HTMLButtonElement;
		// Empty note: button disabled.
		assert.equal(submit.disabled, true, 'override submit must be disabled when note is empty');

		// Click anyway to verify nothing is sent (defensive against any future regression).
		await act(async () => {
			fireEvent.click(submit);
		});
		assert.equal(
			sent.filter((m) => (m as { type?: string }).type === 'record_override').length,
			0,
			'no record_override message must be sent when button is disabled',
		);

		// Type a valid note + submit.
		const noteInput = screen.getByTestId('override-note-input') as HTMLTextAreaElement;
		await act(async () => {
			fireEvent.change(noteInput, { target: { value: 'fixing critical security bug under approval from secops' } });
		});
		assert.equal(submit.disabled, false, 'override submit enabled after note >=1 char entered');

		await act(async () => {
			fireEvent.click(submit);
		});

		const overrideMsgs = sent.filter((m) => (m as { type?: string }).type === 'record_override');
		assert.equal(overrideMsgs.length, 1);
		const msg = overrideMsgs[0] as { type: string; payload: { change_id: string; contract_node_id: string; section_name: string; note: string } };
		assert.deepEqual(msg.payload, {
			change_id: FIXED_CHANGE_ID,
			contract_node_id: FIXED_CONTRACT_ID,
			section_name: 'Authentication',
			note: 'fixing critical security bug under approval from secops',
		});
	});

	it('Promise.race timeout pattern — initial dispatch with compliance_report=null shows spinner; partial arrives later via panel postMessage', async () => {
		const { api } = makeStubVsCodeApi();
		const rpc = new WebviewRpc(api);
		render(React.createElement(App, { rpc, DiffComponent: StubDiff }));

		// Initial dispatch: lock fires but compliance_report=null (50ms Promise.race timeout
		// in tier-dispatch.ts elapsed before the kernel notification arrived). Webview shows
		// the loading spinner only.
		const payload = makeShowPayload({
			lock_trigger: {
				contract_node_id: FIXED_CONTRACT_ID,
				contract_anchor_file: '/contracts/api_security.md',
				section_name: 'Authentication',
				edited_line_range: [7, 9],
				hunk_index: 0,
			},
			compliance_report: null, // simulates tier-dispatch's race timeout
		});

		await act(async () => {
			dispatchHostMessage({ type: 'canvas.show', payload });
		});

		// Spinner visible; no buckets rendered yet.
		assert.ok(screen.getByTestId('compliance-report-loading'), 'loading indicator present on initial null report');
		assert.equal(screen.queryByTestId('bucket-definitely'), null, 'definitely bucket not rendered on null report');

		// Notification arrives ~75ms later — bridge's tier-dispatch posts the partial via
		// panel.postComplianceReportPartial; this simulates that arrival on the webview side.
		await new Promise((r) => setTimeout(r, 25));
		await act(async () => {
			dispatchHostMessage({
				type: 'compliance_report.partial',
				payload: {
					report: {
						contract_node_id: FIXED_CONTRACT_ID,
						max_hops: 1,
						definitely_affected: [
							{ node_id: '01JF' + 'A'.repeat(22), kind: 'ContractNode', edge_path: '/protects:0', hops: 1, body_preview: 'late-arrival first-degree' },
						],
						potentially_affected: [],
						truncated: false,
						generated_at: new Date().toISOString(),
					},
				},
			});
		});

		// First-degree bucket now visible.
		const definitelyBucket = screen.getByTestId('bucket-definitely');
		assert.match(definitelyBucket.textContent ?? '', /Definitely Affected \(1\)/);
		// Loading indicator remains because max_hops still < 3.
		assert.ok(screen.getByTestId('compliance-report-loading'), 'loading indicator persists until full report arrives');
	});

	it('IntentDriftBadge renders next to citations whose intent_drift_badge is non-null (DRIFT-02 + Plan 07-07 surface)', async () => {
		const { api } = makeStubVsCodeApi();
		const rpc = new WebviewRpc(api);
		render(React.createElement(App, { rpc, DiffComponent: StubDiff }));

		const payload = makeShowPayload({
			citations: [
				{
					node_id: FIXED_NODE_ID,
					version: '01J' + 'V'.repeat(23),
					confidence: 'Explicit',
					edge_path: 'parent_of:0',
					snippet: 'Use refresh-token rotation',
					body_preview: 'Use refresh-token rotation',
					successor_id: null,
					intent_drift_badge: {
						kind: 'priority-mismatch',
						citation_node_id: FIXED_NODE_ID,
						session_priority: 'Speed-First',
						cited_priority: 'Quality-First',
						explanation: `This rule was derived under 'Quality-First'; current session is 'Speed-First'. Re-evaluate before applying.`,
					},
				},
			],
		});

		await act(async () => {
			dispatchHostMessage({ type: 'canvas.show', payload });
		});

		const badge = screen.getByTestId('intent-drift-badge');
		assert.ok(badge, 'intent-drift-badge rendered');
		assert.match(badge.getAttribute('title') ?? '', /Quality-First/);
		assert.match(badge.getAttribute('title') ?? '', /Speed-First/);
	});
});
