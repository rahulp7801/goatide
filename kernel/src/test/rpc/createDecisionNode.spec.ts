/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/rpc/createDecisionNode.spec.ts -- Phase 20 Plan 20-01 AUTH-01 Wave-0 RED.
//
// Asserts the new `graph.createDecisionNode` kernel RPC round-trips body + anchor into a
// queryable DecisionNode. Flips GREEN when Plan 20-02 lands:
//   1. CreateDecisionNodeRequest in kernel/src/rpc/methods.ts
//   2. connection.onRequest handler in kernel/src/rpc/server.ts (mirror RecordContractOverrideRequest shape)
//
// Pattern: paired Duplex MessageConnection (mirror atomic-accept.spec.ts).
// Research source: 20-RESEARCH.md "Current State of Touched Files" + "Code Examples Example 1".

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Duplex } from 'node:stream';
import * as rpc from 'vscode-jsonrpc/node.js';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO } from '../../graph/index.js';
import { ReceiptDAO } from '../../receipt/index.js';
import { createRpcServer } from '../../rpc/index.js';

interface PairedStreams {
	clientReader: rpc.MessageReader;
	clientWriter: rpc.MessageWriter;
	serverReader: rpc.MessageReader;
	serverWriter: rpc.MessageWriter;
}

function pairedStreams(): PairedStreams {
	const a = new Duplex({ read() { /* push from outside */ }, write(c, _e, cb) { b.push(c); cb(); } });
	const b = new Duplex({ read() { /* push from outside */ }, write(c, _e, cb) { a.push(c); cb(); } });
	return {
		clientReader: new rpc.StreamMessageReader(b),
		clientWriter: new rpc.StreamMessageWriter(b),
		serverReader: new rpc.StreamMessageReader(a),
		serverWriter: new rpc.StreamMessageWriter(a),
	};
}

describe('Phase 20 AUTH-01 -- graph.createDecisionNode kernel RPC', () => {
	let tmp: TempDb;

	beforeEach(() => { tmp = mkTempDb(); });
	afterEach(() => { tmp.dispose(); });

	it('createDecisionNode: round-trips body+anchor into a queryable DecisionNode', async () => {
		const handle = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(handle.db);
		const receiptDao = new ReceiptDAO(handle.db);

		const streams = pairedStreams();
		const server = createRpcServer({ dao, receiptDao, sqlite: handle.sqlite, reader: streams.serverReader, writer: streams.serverWriter });
		server.listen();
		const client = rpc.createMessageConnection(streams.clientReader, streams.clientWriter);
		client.listen();

		// Step 1 -- dynamic import of CreateDecisionNodeRequest. RED today (Wave 0): the
		// RequestType does not exist in kernel/src/rpc/methods.ts yet. Wave 1 (Plan 20-02)
		// lands it; this test flips GREEN at that point.
		let CreateDecisionNodeRequest: unknown;
		try {
			const methods = await import('../../rpc/methods.js');
			CreateDecisionNodeRequest = (methods as Record<string, unknown>)['CreateDecisionNodeRequest'];
		} catch (e) {
			client.dispose();
			server.dispose();
			handle.close();
			expect.fail(
				'Dynamic import of CreateDecisionNodeRequest failed: ' +
				(e instanceof Error ? e.message : String(e)) +
				' -- Wave 1 (Plan 20-02) must add CreateDecisionNodeRequest to kernel/src/rpc/methods.ts.',
			);
			return;
		}
		if (!CreateDecisionNodeRequest) {
			client.dispose();
			server.dispose();
			handle.close();
			expect.fail(
				'CreateDecisionNodeRequest not exported from kernel/src/rpc/methods.ts -- ' +
				'Wave 1 (Plan 20-02) must add it. Research source: 20-RESEARCH.md Example 1.',
			);
			return;
		}

		// Step 2 -- send the request. Today this is unreachable (expect.fail above). Wave 1+
		// this exercises the new handler.
		const result = await client.sendRequest(CreateDecisionNodeRequest as never, {
			body: 'test rationale text',
			anchor: { file: '/tmp/x.ts' },
		}) as { node_id: string };

		// Step 3 -- assert the created node is queryable as a DecisionNode.
		const queried = dao.queryById(result.node_id);

		expect({
			hasNodeId: typeof result?.node_id === 'string' && result.node_id.length > 0,
			kind: queried?.kind,
			body: (queried?.payload as { body?: string } | undefined)?.body,
		}).toEqual({
			hasNodeId: true,
			kind: 'DecisionNode',
			body: 'test rationale text',
		});

		client.dispose();
		server.dispose();
		handle.close();
	});
});
