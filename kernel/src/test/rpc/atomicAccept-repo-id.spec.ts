/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/rpc/atomicAccept-repo-id.spec.ts -- Phase 21 Plan 21-01 XREPO-01c/e.
//
// RED stub. Two cases:
// (a) atomicAccept with explicit repo_id='testrepofingerprint' asserts
//     provenance.detail.repo_id === 'testrepofingerprint' in the persisted Attempt node.
// (b) atomicAccept WITHOUT repo_id asserts provenance.detail.repo_id === 'primary'
//     (XREPO-01e default invariant).
//
// Today (Wave 0): repo_id is NOT declared on AtomicAcceptParams. @ts-expect-error allows
// compilation while the field is absent. The handler does NOT yet write repo_id into
// provenance.detail, so case (a) fails on the assertion and case (b) fails because
// provenance.detail.repo_id is undefined (not 'primary').
//
// GREEN after Plan 21-02 adds `repo_id?: string` to AtomicAcceptParams and the handler
// threads it into provenance.detail with 'primary' as the default.
//
// Grep alignment: 'atomicAccept.*repo_id' + 'atomicAccept.*default.*primary' (21-VALIDATION.md).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Duplex } from 'node:stream';
import * as path from 'node:path';
import * as os from 'node:os';
import * as rpc from 'vscode-jsonrpc/node.js';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { seedAnchoredConstraint } from '../helpers/canvas-fixtures.js';
import { openDatabase, GraphDAO } from '../../graph/index.js';
import { ReceiptDAO, buildReceipt } from '../../receipt/index.js';
import { createRpcServer } from '../../rpc/index.js';
import { AtomicAcceptRequest } from '../../rpc/methods.js';

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

describe('Phase 21 XREPO-01c/e -- graph.atomicAccept repo_id threading (RED stub)', () => {
	let tmp: TempDb;

	beforeEach(() => { tmp = mkTempDb(); });
	afterEach(() => { tmp.dispose(); });

	it('atomicAccept rides repo_id into provenance.detail', async () => {
		const handle = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(handle.db);
		const receiptDao = new ReceiptDAO(handle.db);
		seedAnchoredConstraint(dao, handle.sqlite, { file: 'src/auth.ts' });
		const receipt = buildReceipt(
			{ diff: SAMPLE_DIFF, destructive: false, asOf: new Date().toISOString() },
			dao, receiptDao, handle.sqlite,
		);

		const streams = pairedStreams();
		const server = createRpcServer({ dao, receiptDao, sqlite: handle.sqlite, reader: streams.serverReader, writer: streams.serverWriter });
		server.listen();
		const client = rpc.createMessageConnection(streams.clientReader, streams.clientWriter);
		client.listen();

		// Cast params to include repo_id which arrives in Plan 21-02 (XREPO-01c).
		const params = {
			change_id: receipt.change_id,
			receipt_id: receipt.id,
			tier: 'modal',
			accept_latency_ms: 100,
			staging_path: path.join(os.tmpdir(), 'auth.goat-staging-01J'),
			target_path: 'src/auth.ts',
			body: 'accepted modal save of src/auth.ts',
			anchor: { file: 'src/auth.ts' },
			repo_id: 'testrepofingerprint', // Plan 21-02 will declare this on AtomicAcceptParams.
		} as unknown as import('../../rpc/methods.js').AtomicAcceptParams;
		const result = await client.sendRequest(AtomicAcceptRequest, params);

		const provRow = dao.queryProvenance(result.attempt_node_id);
		const provDetail = provRow?.detail as { repo_id?: string } | null;

		// RED today: handler does not yet write repo_id into provenance.detail.
		// GREEN after Plan 21-02 threads repo_id from params into the detail map.
		expect(provDetail?.repo_id).toBe('testrepofingerprint');

		client.dispose();
		server.dispose();
		handle.close();
	});

	it('atomicAccept default repo_id is primary when omitted', async () => {
		const handle = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(handle.db);
		const receiptDao = new ReceiptDAO(handle.db);
		seedAnchoredConstraint(dao, handle.sqlite, { file: 'src/auth.ts' });
		const receipt = buildReceipt(
			{ diff: SAMPLE_DIFF, destructive: false, asOf: new Date().toISOString() },
			dao, receiptDao, handle.sqlite,
		);

		const streams = pairedStreams();
		const server = createRpcServer({ dao, receiptDao, sqlite: handle.sqlite, reader: streams.serverReader, writer: streams.serverWriter });
		server.listen();
		const client = rpc.createMessageConnection(streams.clientReader, streams.clientWriter);
		client.listen();

		const result = await client.sendRequest(AtomicAcceptRequest, {
			change_id: receipt.change_id,
			receipt_id: receipt.id,
			tier: 'silent',
			accept_latency_ms: 0,
			staging_path: path.join(os.tmpdir(), 'auth2.goat-staging-01J'),
			target_path: 'src/auth.ts',
			body: 'accepted silent save',
			anchor: { file: 'src/auth.ts' },
			// repo_id intentionally omitted -- XREPO-01e default invariant: must default to 'primary'.
		});

		const provRow = dao.queryProvenance(result.attempt_node_id);
		const provDetail = provRow?.detail as { repo_id?: string } | null;

		// RED today: handler does not yet write repo_id at all.
		// GREEN after Plan 21-02 defaults omitted repo_id to 'primary' in the detail map.
		expect(provDetail?.repo_id).toBe('primary');

		client.dispose();
		server.dispose();
		handle.close();
	});
});
