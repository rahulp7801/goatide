/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/rpc/reject.spec.ts — Plan 04-04 CANV-03 reject-with-note RPC.
//
// Covers:
//   1. recordRejection creates OpenQuestion + 'references' edge + threads
//      rejected_change_id in provenance.detail.
//   2. recordRejection rejects empty note (handler-side >=1 char check).
//   3. recordRejection on missing receipt_id throws clear error.
//   4. recordRejection without first citation creates OpenQuestion but no edge.

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
const NO_CITATIONS_DIFF = 'diff --git a/no.ts b/no.ts\n--- a/no.ts\n+++ b/no.ts\n@@ -1,1 +1,2 @@\n a\n+b\n';

describe('CANV-03 — Reject-with-Note RPC (graph.recordRejection)', () => {
	let tmp: TempDb;
	beforeEach(() => { tmp = mkTempDb(); });
	afterEach(() => { tmp.dispose(); });

	it('recordRejection creates an OpenQuestion + references edge to first cited node + threads rejected_change_id in detail', async () => {
		const handle = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(handle.db);
		const receiptDao = new ReceiptDAO(handle.db);
		const cited = seedAnchoredConstraint(dao, handle.sqlite, { file: 'src/auth.ts' });
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
			note: 'rejected because the rule does not apply here',
		});

		const oq = dao.queryById(result.open_question_id);
		const edgeRow = handle.sqlite.prepare(`SELECT kind, dst_id FROM edges WHERE src_id = ?`).get(result.open_question_id) as { kind: string; dst_id: string } | undefined;
		const provRow = dao.queryProvenance(result.open_question_id);
		const oqPayload = oq?.payload as { body: string };
		const provDetail = provRow?.detail as { rejected_change_id?: string; action?: string; receipt_id?: string } | null;
		expect({
			oqKind: oq?.kind,
			oqBody: oqPayload.body,
			edgeKind: edgeRow?.kind,
			edgeDst: edgeRow?.dst_id,
			provDetailRejectedChangeId: provDetail?.rejected_change_id,
			provDetailAction: provDetail?.action,
			provDetailReceiptId: provDetail?.receipt_id,
		}).toEqual({
			oqKind: 'OpenQuestion',
			oqBody: 'rejected because the rule does not apply here',
			edgeKind: 'references',
			edgeDst: cited.nodeId,
			provDetailRejectedChangeId: receipt.change_id,
			provDetailAction: 'reject_with_note',
			provDetailReceiptId: receipt.id,
		});

		client.dispose();
		server.dispose();
		handle.close();
	});

	it('recordRejection rejects empty note', async () => {
		const handle = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(handle.db);
		const receiptDao = new ReceiptDAO(handle.db);
		const streams = pairedStreams();
		const server = createRpcServer({ dao, receiptDao, sqlite: handle.sqlite, reader: streams.serverReader, writer: streams.serverWriter });
		server.listen();
		const client = rpc.createMessageConnection(streams.clientReader, streams.clientWriter);
		client.listen();

		await expect(client.sendRequest(RecordRejectionRequest, {
			receipt_id: '01J' + 'R'.repeat(23),
			change_id: '01J' + 'C'.repeat(23),
			note: '',
		})).rejects.toThrow(/note must be >=1 char/);

		client.dispose();
		server.dispose();
		handle.close();
	});

	it('recordRejection throws on missing receipt_id', async () => {
		const handle = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(handle.db);
		const receiptDao = new ReceiptDAO(handle.db);
		const streams = pairedStreams();
		const server = createRpcServer({ dao, receiptDao, sqlite: handle.sqlite, reader: streams.serverReader, writer: streams.serverWriter });
		server.listen();
		const client = rpc.createMessageConnection(streams.clientReader, streams.clientWriter);
		client.listen();

		await expect(client.sendRequest(RecordRejectionRequest, {
			receipt_id: '01J' + 'X'.repeat(23),
			change_id: '01J' + 'C'.repeat(23),
			note: 'valid note',
		})).rejects.toThrow(/receipt not found/);

		client.dispose();
		server.dispose();
		handle.close();
	});

	it('recordRejection without first citation creates OpenQuestion but no edge', async () => {
		const handle = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(handle.db);
		const receiptDao = new ReceiptDAO(handle.db);
		// Hand-craft a receipt with no citations: no anchor file is seeded for no.ts.
		const r = buildReceipt(
			{ diff: NO_CITATIONS_DIFF, destructive: false, asOf: new Date().toISOString() },
			dao, receiptDao, handle.sqlite,
		);
		expect(r.citations.length).toBe(0);

		const streams = pairedStreams();
		const server = createRpcServer({ dao, receiptDao, sqlite: handle.sqlite, reader: streams.serverReader, writer: streams.serverWriter });
		server.listen();
		const client = rpc.createMessageConnection(streams.clientReader, streams.clientWriter);
		client.listen();

		const result = await client.sendRequest(RecordRejectionRequest, {
			receipt_id: r.id, change_id: r.change_id, note: 'no citations to anchor against',
		});

		const oq = dao.queryById(result.open_question_id);
		const edges = handle.sqlite.prepare(`SELECT count(*) as c FROM edges WHERE src_id = ?`).get(result.open_question_id) as { c: number };
		expect({ oqKind: oq?.kind, edgeCount: edges.c }).toEqual({ oqKind: 'OpenQuestion', edgeCount: 0 });

		client.dispose();
		server.dispose();
		handle.close();
	});
});
