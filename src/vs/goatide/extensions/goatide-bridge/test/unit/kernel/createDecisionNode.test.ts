/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 20 Plan 20-01 AUTH-01 SC#1b -- Wave-0 RED stub for bridge KernelClient.createDecisionNode.
//
// AUTHORING-TIME NOTE (2026-05-18 retroactive Plan 20-01 closure):
// This file was authored AFTER Plan 20-02 already landed `KernelClient.createDecisionNode`
// (commit 3e7198ca2bd). The contract this file encodes is therefore IMMEDIATELY GREEN as a
// regression gate (TDD philosophy: the spec still has value even when its surface has shipped).
// If a future refactor renames the method or removes the route to the RPC literal token
// `'graph.createDecisionNode'`, this test will RED-flip and block the regression.
//
// Research source: 20-RESEARCH.md "Current State of Touched Files" -- kernel/client.ts.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';

describe('Phase 20 AUTH-01 -- KernelClient.createDecisionNode method', () => {

	it('createDecisionNode: routes to graph.createDecisionNode RPC via sendWithTimeout', async () => {
		// Step 1 -- dynamic import of the bridge KernelClient module + the wire-type
		// constant. Both must be exported -- if either is missing, the test fails with a
		// clear pointer at Plan 20-02 (the GREEN-flip target for this Wave-0 stub).
		const clientModule = await import('../../../src/kernel/client.js');
		const methodsModule = await import('../../../src/kernel/methods.js');

		const KernelClient = (clientModule as Record<string, unknown>)['KernelClient'] as
			(new (...args: never[]) => Record<string, unknown>) | undefined;
		assert.ok(
			KernelClient,
			'KernelClient not exported from src/kernel/client.ts',
		);

		const CreateDecisionNodeRequest = (methodsModule as Record<string, unknown>)['CreateDecisionNodeRequest'];
		assert.ok(
			CreateDecisionNodeRequest,
			'CreateDecisionNodeRequest not exported from src/kernel/methods.ts -- ' +
			'Wave 1 (Plan 20-02) must add it as the bridge mirror of the kernel wire type.',
		);

		// Step 2 -- prototype must expose the method (Plan 20-02 contract).
		const proto = KernelClient.prototype as Record<string, unknown>;
		assert.strictEqual(
			typeof proto['createDecisionNode'],
			'function',
			'KernelClient.prototype.createDecisionNode is not a function -- ' +
			'Wave 1 (Plan 20-02) must add the method that routes to graph.createDecisionNode RPC. ' +
			'Research source: 20-RESEARCH.md Code Example 1.',
		);

		// Step 3 -- the body of `createDecisionNode` must route through sendWithTimeout with the
		// CreateDecisionNodeRequest literal. We verify this by monkey-patching sendWithTimeout
		// on the prototype to capture the (RequestType, params) tuple, then invoking
		// createDecisionNode against a stub KernelClient instance constructed via
		// Object.create (we bypass the constructor because the real one needs a child process).
		const captured: Array<{ req: unknown; params: unknown }> = [];
		const origSendWithTimeout = proto['sendWithTimeout'];
		(proto as Record<string, unknown>)['sendWithTimeout'] = async (req: unknown, params: unknown) => {
			captured.push({ req, params });
			return { node_id: 'test-id' };
		};

		try {
			const instance = Object.create(proto) as { createDecisionNode: (p: unknown) => Promise<unknown> };
			const result = await instance.createDecisionNode({
				body: 'rationale',
				anchor: { file: '/tmp/x.ts' },
			}) as { node_id: string };

			assert.strictEqual(captured.length, 1,
				'createDecisionNode must invoke sendWithTimeout exactly once.');
			assert.strictEqual(captured[0].req, CreateDecisionNodeRequest,
				'createDecisionNode must route through the CreateDecisionNodeRequest literal ' +
				'(byte-identical wire-name "graph.createDecisionNode" with kernel side -- Pitfall 5).');
			assert.deepStrictEqual(
				captured[0].params,
				{ body: 'rationale', anchor: { file: '/tmp/x.ts' } },
				'createDecisionNode must forward params verbatim to sendWithTimeout (no munging).',
			);
			assert.strictEqual(result.node_id, 'test-id',
				'createDecisionNode must return the sendWithTimeout result verbatim.');
		} finally {
			(proto as Record<string, unknown>)['sendWithTimeout'] = origSendWithTimeout;
		}
	});

});
