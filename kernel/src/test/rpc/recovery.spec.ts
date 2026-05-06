/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/rpc/recovery.spec.ts — Plan 04-04 CANV-07 recovery scan support.
//
// Covers:
//   1. queryAttemptByStagingPath returns the matching Attempt row + target_path +
//      attempt_kind after atomicAccept persisted them.
//   2. queryAttemptByStagingPath returns all-null for an orphan staging path (no
//      matching Attempt).
//   3. atomicAccept Zod failure leaves the DB unchanged (rollback) — no Attempt + no
//      edge.
//
// File-write coordination (stage+rename+parent-fsync) lives bridge-side (Plan 04-05);
// the kernel-side proves that the DB-side atomicity contract holds for the recovery
// scan to lean on.

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
import { AtomicAcceptRequest, QueryAttemptByStagingPathRequest } from '../../rpc/methods.js';

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

describe('CANV-07 + ROADMAP SC #2 — recovery via queryAttemptByStagingPath', () => {
	let tmp: TempDb;
	beforeEach(() => { tmp = mkTempDb(); });
	afterEach(() => { tmp.dispose(); });

	it('queryAttemptByStagingPath returns the matching Attempt after atomicAccept', async () => {
		const handle = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(handle.db);
		const receiptDao = new ReceiptDAO(handle.db);
		seedAnchoredConstraint(dao, handle.sqlite, { file: 'src/auth.ts' });
		const r = buildReceipt(
			{ diff: SAMPLE_DIFF, destructive: false, asOf: new Date().toISOString() },
			dao, receiptDao, handle.sqlite,
		);

		const streams = pairedStreams();
		const server = createRpcServer({ dao, receiptDao, sqlite: handle.sqlite, reader: streams.serverReader, writer: streams.serverWriter });
		server.listen();
		const client = rpc.createMessageConnection(streams.clientReader, streams.clientWriter);
		client.listen();

		const stagingPath = path.join(os.tmpdir(), 'src-auth.ts.goat-staging-01JKL');
		await client.sendRequest(AtomicAcceptRequest, {
			change_id: r.change_id, receipt_id: r.id,
			tier: 'modal', accept_latency_ms: 500,
			staging_path: stagingPath, target_path: 'src/auth.ts',
			body: 'accepted', anchor: { file: 'src/auth.ts' },
		});

		const lookup = await client.sendRequest(QueryAttemptByStagingPathRequest, { staging_path: stagingPath });
		expect({
			hasAttempt: lookup.attempt_node_id !== null,
			targetPath: lookup.target_path,
			attemptKind: lookup.attempt_kind,
		}).toEqual({ hasAttempt: true, targetPath: 'src/auth.ts', attemptKind: 'accepted' });

		client.dispose();
		server.dispose();
		handle.close();
	});

	it('queryAttemptByStagingPath returns null for orphan staging path with no Attempt', async () => {
		const handle = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(handle.db);
		const receiptDao = new ReceiptDAO(handle.db);
		const streams = pairedStreams();
		const server = createRpcServer({ dao, receiptDao, sqlite: handle.sqlite, reader: streams.serverReader, writer: streams.serverWriter });
		server.listen();
		const client = rpc.createMessageConnection(streams.clientReader, streams.clientWriter);
		client.listen();

		const lookup = await client.sendRequest(QueryAttemptByStagingPathRequest, {
			staging_path: path.join(os.tmpdir(), 'nonexistent.goat-staging-01J'),
		});
		expect({
			attemptNodeId: lookup.attempt_node_id,
			targetPath: lookup.target_path,
			attemptKind: lookup.attempt_kind,
		}).toEqual({ attemptNodeId: null, targetPath: null, attemptKind: null });

		client.dispose();
		server.dispose();
		handle.close();
	});

	it('atomicAccept Zod failure leaves DB unchanged (rollback) — no new Attempt + no new edge', async () => {
		const handle = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(handle.db);
		const receiptDao = new ReceiptDAO(handle.db);
		seedAnchoredConstraint(dao, handle.sqlite, { file: 'src/auth.ts' });
		const r = buildReceipt(
			{ diff: SAMPLE_DIFF, destructive: false, asOf: new Date().toISOString() },
			dao, receiptDao, handle.sqlite,
		);

		const streams = pairedStreams();
		const server = createRpcServer({ dao, receiptDao, sqlite: handle.sqlite, reader: streams.serverReader, writer: streams.serverWriter });
		server.listen();
		const client = rpc.createMessageConnection(streams.clientReader, streams.clientWriter);
		client.listen();

		const beforeAttempts = handle.sqlite.prepare(`SELECT count(*) as c FROM nodes WHERE kind = 'Attempt'`).get() as { c: number };
		const beforeEdges = handle.sqlite.prepare(`SELECT count(*) as c FROM edges WHERE kind = 'references'`).get() as { c: number };
		await expect(client.sendRequest(AtomicAcceptRequest, {
			change_id: r.change_id, receipt_id: r.id,
			tier: 'modal', accept_latency_ms: 100,
			staging_path: path.join(os.tmpdir(), 'x'), target_path: 'x',
			body: 'thanks for accepting',  // Ghosting — Zod fails BEFORE tx
			anchor: { file: 'x' },
		})).rejects.toThrow();
		const afterAttempts = handle.sqlite.prepare(`SELECT count(*) as c FROM nodes WHERE kind = 'Attempt'`).get() as { c: number };
		const afterEdges = handle.sqlite.prepare(`SELECT count(*) as c FROM edges WHERE kind = 'references'`).get() as { c: number };
		expect({
			attemptDelta: afterAttempts.c - beforeAttempts.c,
			edgeDelta: afterEdges.c - beforeEdges.c,
		}).toEqual({ attemptDelta: 0, edgeDelta: 0 });

		client.dispose();
		server.dispose();
		handle.close();
	});
});
