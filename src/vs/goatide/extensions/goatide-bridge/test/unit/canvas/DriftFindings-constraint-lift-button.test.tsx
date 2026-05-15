/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/canvas/DriftFindings-constraint-lift-button.test.tsx — Phase 16 Plan 16-01 Task 4.
//
// 3-case jsdom suite for the constraint-lift button in DriftFindings.tsx.
// Phase 16 Plan 16-04 GREEN-flips (Wave 3).
// VALIDATION.md task rows 16-00-24..26 grep target: verbatim case-name strings.

import { describe, it, afterEach } from 'mocha';
import { strict as assert } from 'node:assert';
import * as React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { DriftFindings, type DriftFindingsCitation } from '../../../src/canvas/webview/DriftFindings.js';
import type { WebviewRpc, VsCodeApi } from '../../../src/canvas/rpc.js';
import { WebviewRpc as WebviewRpcImpl } from '../../../src/canvas/rpc.js';

afterEach(() => { cleanup(); });

const CONSTRAINT_NODE_ID = '01JN00000000000000000000001'.slice(0, 26);

function makeStubVsCodeApi(): { api: VsCodeApi; sent: unknown[] } {
	const sent: unknown[] = [];
	const api: VsCodeApi = {
		postMessage: (m: unknown) => { sent.push(m); },
		getState: () => null,
		setState: () => { /* noop */ },
	};
	return { api, sent };
}

const STUB_FINDING = {
	contract_node_id: '01J' + 'A'.repeat(23),
	contract_anchor_file: 'src/auth.ts',
	pattern_index: 0,
	pattern_kind: 'regex' as const,
	file: 'src/auth.ts',
	hunk_line: 10,
	message: 'Auth pattern violation',
};

describe('DriftFindings constraint.lift button', () => {
	it('DriftFindings constraint.lift button renders when payload citations include a ConstraintNode', () => {
		const citations: DriftFindingsCitation[] = [
			{ cited_payload: { kind: 'ConstraintNode', node_id: CONSTRAINT_NODE_ID } },
		];
		const { api } = makeStubVsCodeApi();
		const rpc = new WebviewRpcImpl(api);
		render(React.createElement(DriftFindings, {
			findings: [STUB_FINDING],
			citations,
			constraintLiftEligible: true,
			rpc,
		}));
		const btn = screen.queryByTestId('drift-findings-constraint-lift-button');
		assert.ok(btn !== null, 'button should be present');
		assert.ok(btn!.textContent === 'What would break if this constraint is lifted?', `button text should match, got: ${btn!.textContent}`);
	});

	it('DriftFindings constraint.lift button hidden when no ConstraintNode citation', () => {
		// Case A: eligible=true but citations only have DecisionNode — button hidden
		const decisionCitations: DriftFindingsCitation[] = [
			{ cited_payload: { kind: 'DecisionNode', node_id: CONSTRAINT_NODE_ID } },
		];
		const { api: api1 } = makeStubVsCodeApi();
		const rpc1 = new WebviewRpcImpl(api1);
		render(React.createElement(DriftFindings, {
			findings: [STUB_FINDING],
			citations: decisionCitations,
			constraintLiftEligible: true,
			rpc: rpc1,
		}));
		assert.ok(
			screen.queryByTestId('drift-findings-constraint-lift-button') === null,
			'button should be absent when no ConstraintNode citation',
		);

		cleanup();

		// Case B: eligible=false even with a ConstraintNode citation — button hidden
		const constraintCitations: DriftFindingsCitation[] = [
			{ cited_payload: { kind: 'ConstraintNode', node_id: CONSTRAINT_NODE_ID } },
		];
		const { api: api2 } = makeStubVsCodeApi();
		const rpc2 = new WebviewRpcImpl(api2);
		render(React.createElement(DriftFindings, {
			findings: [STUB_FINDING],
			citations: constraintCitations,
			constraintLiftEligible: false,
			rpc: rpc2,
		}));
		assert.ok(
			screen.queryByTestId('drift-findings-constraint-lift-button') === null,
			'button should be absent when constraintLiftEligible is false',
		);
	});

	it('DriftFindings constraint.lift button onClick posts canvas.requestConstraintLift with picked ConstraintNode id', () => {
		const citations: DriftFindingsCitation[] = [
			{ cited_payload: { kind: 'ConstraintNode', node_id: CONSTRAINT_NODE_ID } },
		];
		const { api, sent } = makeStubVsCodeApi();
		const rpc = new WebviewRpcImpl(api);
		render(React.createElement(DriftFindings, {
			findings: [STUB_FINDING],
			citations,
			constraintLiftEligible: true,
			rpc,
		}));
		const btn = screen.getByTestId('drift-findings-constraint-lift-button');
		fireEvent.click(btn);
		assert.deepStrictEqual(sent, [
			{
				type: 'canvas.requestConstraintLift',
				payload: {
					constraint_node_id: CONSTRAINT_NODE_ID,
					max_hops: 3,
					confidence_threshold: 0.5,
				},
			},
		]);
	});
});
