/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/rpc/atomic-accept.spec.ts — Plan 04-04 CANV-07 atomic accept RPC.
//
// Covers:
//   1. atomicAccept inserts Attempt node + 'references' edge to first cited node;
//      returns attempt_node_id; persists tier + accept_latency_ms in payload.
//   2. atomicAccept rejects payloads that violate Ghosting (Zod refuses BEFORE tx);
//      no Attempt is created.
//   3. atomicAccept handles missing receipt (degraded path) without throwing — no edge
//      written, but the Attempt is still persisted.
//   4. atomicAccept persists tier + accept_latency_ms in the Attempt payload (CANV-09
//      telemetry; cross-checked structurally in attempt-payload.spec).
//
// Pattern: paired Duplex MessageConnection (Plan 03-04 server.spec).

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

describe('CANV-07 — atomic accept RPC', () => {
	let tmp: TempDb;

	beforeEach(() => { tmp = mkTempDb(); });
	afterEach(() => { tmp.dispose(); });

	it('atomicAccept inserts Attempt + references edge in one transaction; returns attempt_node_id', async () => {
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

		const result = await client.sendRequest(AtomicAcceptRequest, {
			change_id: receipt.change_id,
			receipt_id: receipt.id,
			tier: 'modal',
			accept_latency_ms: 1234,
			staging_path: path.join(os.tmpdir(), 'src-auth.ts.goat-staging-01J'),
			target_path: 'src/auth.ts',
			body: 'accepted modal save of src/auth.ts',
			anchor: { file: 'src/auth.ts' },
		});

		const persisted = dao.queryById(result.attempt_node_id);
		const edgeRow = handle.sqlite.prepare(`SELECT kind, src_id, dst_id FROM edges WHERE src_id = ?`).get(result.attempt_node_id) as { kind: string; src_id: string; dst_id: string } | undefined;
		const persistedPayload = persisted?.payload as { attempt_kind?: string; tier?: string; accept_latency_ms?: number };

		expect({
			hasAttemptNodeId: typeof result.attempt_node_id === 'string' && result.attempt_node_id.length === 26,
			persistedKind: persisted?.kind,
			persistedAttemptKind: persistedPayload.attempt_kind,
			persistedTier: persistedPayload.tier,
			persistedLatency: persistedPayload.accept_latency_ms,
			edgeKind: edgeRow?.kind,
			edgeDst: edgeRow?.dst_id,
		}).toEqual({
			hasAttemptNodeId: true,
			persistedKind: 'Attempt',
			persistedAttemptKind: 'accepted',
			persistedTier: 'modal',
			persistedLatency: 1234,
			edgeKind: 'references',
			edgeDst: cited.nodeId,
		});

		client.dispose();
		server.dispose();
		handle.close();
	});

	it('atomicAccept rejects payload that violates Ghosting (Zod refuses BEFORE tx)', async () => {
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

		await expect(client.sendRequest(AtomicAcceptRequest, {
			change_id: receipt.change_id,
			receipt_id: receipt.id,
			tier: 'modal',
			accept_latency_ms: 100,
			staging_path: path.join(os.tmpdir(), 'x.goat-staging-01J'),
			target_path: 'x',
			body: 'thanks for the change',  // Ghosting violation
			anchor: { file: 'x' },
		})).rejects.toThrow();

		// Confirm no Attempt was created.
		const attempts = dao.queryByKind('Attempt');
		expect(attempts.length).toBe(0);

		client.dispose();
		server.dispose();
		handle.close();
	});

	it('atomicAccept handles missing receipt (degraded path) without throwing; no edge written', async () => {
		const handle = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(handle.db);
		const receiptDao = new ReceiptDAO(handle.db);

		const streams = pairedStreams();
		const server = createRpcServer({ dao, receiptDao, sqlite: handle.sqlite, reader: streams.serverReader, writer: streams.serverWriter });
		server.listen();
		const client = rpc.createMessageConnection(streams.clientReader, streams.clientWriter);
		client.listen();

		const result = await client.sendRequest(AtomicAcceptRequest, {
			change_id: '01J' + 'C'.repeat(23),
			receipt_id: '01J' + 'R'.repeat(23),    // doesn't exist
			tier: 'silent',
			accept_latency_ms: 0,
			staging_path: path.join(os.tmpdir(), 'y.goat-staging-01J'),
			target_path: 'y',
			body: 'accepted silent save',
			anchor: { file: 'y' },
		});

		const edgeCount = handle.sqlite.prepare(`SELECT count(*) as c FROM edges WHERE src_id = ?`).get(result.attempt_node_id) as { c: number };
		expect({
			hasAttemptNodeId: typeof result.attempt_node_id === 'string',
			edgeCount: edgeCount.c,
		}).toEqual({ hasAttemptNodeId: true, edgeCount: 0 });

		client.dispose();
		server.dispose();
		handle.close();
	});

	it('atomicAccept persists tier + accept_latency_ms in payload (CANV-09 telemetry round-trip via RPC)', async () => {
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
			change_id: receipt.change_id, receipt_id: receipt.id,
			tier: 'inline', accept_latency_ms: 555,
			staging_path: path.join(os.tmpdir(), 'auth.goat-staging-01J'), target_path: 'src/auth.ts',
			body: 'accepted inline', anchor: { file: 'src/auth.ts' },
		});
		const persisted = dao.queryById(result.attempt_node_id);
		const persistedPayload = persisted?.payload as { tier?: string; accept_latency_ms?: number };
		expect({
			tier: persistedPayload.tier,
			latency: persistedPayload.accept_latency_ms,
		}).toEqual({ tier: 'inline', latency: 555 });

		client.dispose();
		server.dispose();
		handle.close();
	});
});
