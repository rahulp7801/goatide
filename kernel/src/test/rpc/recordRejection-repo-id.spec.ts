/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/rpc/recordRejection-repo-id.spec.ts -- Phase 21 Plan 21-01 XREPO-01d/e.
//
// RED stub. Two cases mirroring atomicAccept-repo-id.spec.ts:
// (a) recordRejection with explicit repo_id='testrepofingerprint' asserts
//     provenance.detail.repo_id === 'testrepofingerprint' in the persisted OpenQuestion node.
// (b) recordRejection WITHOUT repo_id asserts provenance.detail.repo_id === 'primary'
//     (XREPO-01e default invariant).
//
// Today (Wave 0): repo_id is NOT declared on RecordRejectionParams. @ts-expect-error allows
// compilation while the field is absent. The handler does NOT yet write repo_id into
// provenance.detail. RED today; GREEN after Plan 21-02.
//
// Grep alignment: 'recordRejection.*repo_id' + 'recordRejection.*default.*primary'.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Duplex } from 'node:stream';
import * as rpc from 'vscode-jsonrpc/node.js';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { seedAnchoredConstraint } from '../helpers/canvas-fixtures.js';
import { openDatabase, GraphDAO } from '../../graph/index.js';
import { ReceiptDAO, buildReceipt } from '../../receipt/index.js';
import { createRpcServer } from '../../rpc/index.js';
import { RecordRejectionRequest } from '../../rpc/methods.js';

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

describe('Phase 21 XREPO-01d/e -- graph.recordRejection repo_id threading (RED stub)', () => {
	let tmp: TempDb;

	beforeEach(() => { tmp = mkTempDb(); });
	afterEach(() => { tmp.dispose(); });

	it('recordRejection rides repo_id into provenance.detail', async () => {
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

		// Cast params to include repo_id which arrives in Plan 21-02 (XREPO-01d).
		const params = {
			receipt_id: receipt.id,
			change_id: receipt.change_id,
			note: 'rejected: cross-repo rule does not apply',
			repo_id: 'testrepofingerprint', // Plan 21-02 will declare this on RecordRejectionParams.
		} as unknown as import('../../rpc/methods.js').RecordRejectionParams;
		const result = await client.sendRequest(RecordRejectionRequest, params);

		const provRow = dao.queryProvenance(result.open_question_id);
		const provDetail = provRow?.detail as { repo_id?: string } | null;

		// RED today: handler does not yet write repo_id into provenance.detail.
		// GREEN after Plan 21-02 threads repo_id from params into the detail map.
		expect(provDetail?.repo_id).toBe('testrepofingerprint');

		client.dispose();
		server.dispose();
		handle.close();
	});

	it('recordRejection default repo_id is primary when omitted', async () => {
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

		const result = await client.sendRequest(RecordRejectionRequest, {
			receipt_id: receipt.id,
			change_id: receipt.change_id,
			note: 'rejected: no cross-repo context',
			// repo_id intentionally omitted -- XREPO-01e default invariant: must default to 'primary'.
		});

		const provRow = dao.queryProvenance(result.open_question_id);
		const provDetail = provRow?.detail as { repo_id?: string } | null;

		// RED today: handler does not yet write repo_id at all.
		// GREEN after Plan 21-02 defaults omitted repo_id to 'primary' in the detail map.
		expect(provDetail?.repo_id).toBe('primary');

		client.dispose();
		server.dispose();
		handle.close();
	});
});
