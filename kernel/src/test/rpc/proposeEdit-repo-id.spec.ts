/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/rpc/proposeEdit-repo-id.spec.ts -- Phase 21 Plan 21-01 XREPO-01b.
//
// RED stub. Asserts that proposeEdit accepts an optional repo_id field and returns a
// receipt without throwing. Today (Wave 0): repo_id is NOT declared on ProposeEditParams;
// the @ts-expect-error directive allows the test to compile while the field is missing.
// Zod schema enforcement may silently drop the unknown field (passthrough behavior)
// or throw -- the test acts as a forward-compat sentinel regardless.
//
// GREEN after Plan 21-02 adds `repo_id?: string` to ProposeEditParams.
//
// Grep alignment: 'proposeEdit.*repo_id' (21-VALIDATION.md task 21-01-XREPO-01b).
//
// Pattern: paired Duplex MessageConnection (mirror atomic-accept.spec.ts).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Duplex } from 'node:stream';
import * as rpc from 'vscode-jsonrpc/node.js';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { seedAnchoredConstraint } from '../helpers/canvas-fixtures.js';
import { openDatabase, GraphDAO } from '../../graph/index.js';
import { ReceiptDAO } from '../../receipt/index.js';
import { createRpcServer } from '../../rpc/index.js';
import { ProposeEditRequest } from '../../rpc/methods.js';

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

const SAMPLE_DIFF = 'diff --git a/src/auth.ts b/src/auth.ts\n--- a/src/auth.ts\n+++ b/src/auth.ts\n@@ -1,1 +1,2 @@\n a\n+b\n';

describe('Phase 21 XREPO-01b -- graph.proposeEdit repo_id parameter (RED stub)', () => {
	let tmp: TempDb;

	beforeEach(() => { tmp = mkTempDb(); });
	afterEach(() => { tmp.dispose(); });

	it('proposeEdit with repo_id parameter does not throw and returns a receipt', async () => {
		const handle = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(handle.db);
		const receiptDao = new ReceiptDAO(handle.db);
		seedAnchoredConstraint(dao, handle.sqlite, { file: 'src/auth.ts' });

		const streams = pairedStreams();
		const server = createRpcServer({ dao, receiptDao, sqlite: handle.sqlite, reader: streams.serverReader, writer: streams.serverWriter });
		server.listen();
		const client = rpc.createMessageConnection(streams.clientReader, streams.clientWriter);
		client.listen();

		// Cast params to include repo_id which arrives in Plan 21-02 (XREPO-01b).
		// The extra field is not yet on ProposeEditParams; cast via unknown to allow the
		// forward-compat sentinel while keeping tsc clean.
		const params = {
			diff: SAMPLE_DIFF,
			destructive: false,
			repo_id: 'testrepofingerprint', // Plan 21-02 will declare this on ProposeEditParams.
		} as unknown as import('../../rpc/methods.js').ProposeEditParams;
		const result = await client.sendRequest(ProposeEditRequest, params);

		// Assert receipt is returned without throwing (proposeEdit is an in-memory receipt
		// builder; persistence of repo_id in provenance happens in atomicAccept -- see Pitfall A).
		expect(result.receipt).toBeDefined();
		expect(typeof result.receipt.id).toBe('string');

		client.dispose();
		server.dispose();
		handle.close();
	});
});
