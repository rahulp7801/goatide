/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/drift/override.spec.ts — Phase 7 (Plan 07-06) DRIFT-06 audit-trail tests.
//
// Contract-override audit trail: every override of a Contract lock seeds an Attempt(attempt_kind=
// 'contract_override') with the developer's note (>=1 char required), wires a `references` edge
// from the Attempt to the ContractNode, and increments harvest_metrics_daily.contract_overrides
// (source='canvas'). 6 tests — 5 stubs flipped + 1 NEW two-tx documentation pin. Plan 07-01
// staged the it.skip surface; this plan flips them green via the makeDriftHarness factory.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Duplex } from 'node:stream';
import * as rpc from 'vscode-jsonrpc/node.js';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDriftHarness, type DriftHarness } from './_setup.js';
import { ReceiptDAO } from '../../receipt/index.js';
import { createRpcServer } from '../../rpc/server.js';
import { RecordContractOverrideRequest } from '../../rpc/methods.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

interface RpcPair {
	server: rpc.MessageConnection;
	client: rpc.MessageConnection;
	dispose(): void;
}

function startRpcPair(harness: DriftHarness): RpcPair {
	const receiptDao = new ReceiptDAO(harness.dbHandle.db);
	const streams = pairedStreams();
	const server = createRpcServer({
		dao: harness.dao,
		receiptDao,
		sqlite: harness.dbHandle.sqlite,
		metrics: harness.metrics,
		reader: streams.serverReader,
		writer: streams.serverWriter,
	});
	server.listen();
	const client = rpc.createMessageConnection(streams.clientReader, streams.clientWriter);
	client.listen();
	return {
		server,
		client,
		dispose: () => {
			try { client.dispose(); } catch { /* best-effort */ }
			try { server.dispose(); } catch { /* best-effort */ }
		},
	};
}

describe('drift/override — Plan 07-06 (DRIFT-06)', () => {
	let harness: DriftHarness;
	let pair: RpcPair;

	beforeEach(() => {
		harness = makeDriftHarness();
		pair = startRpcPair(harness);
	});

	afterEach(() => {
		pair.dispose();
		harness.cleanup();
	});

	it('graph.recordContractOverride seeds Attempt(attempt_kind=contract_override) with note + provenance.detail.action', async () => {
		const contractId = harness.seedContractFixture('api-security');
		const result = await pair.client.sendRequest(RecordContractOverrideRequest, {
			change_id: '01J' + 'C'.repeat(23),
			contract_node_id: contractId,
			section_name: 'Authentication',
			note: 'auth section override approved by security review',
		});

		const attempt = harness.dao.queryById(result.attempt_node_id);
		const attemptPayload = attempt?.payload as { kind: string; body: string; attempt_kind?: string };
		const provRow = harness.dao.queryProvenance(result.attempt_node_id);
		const provDetail = provRow?.detail as { action?: string; section_name?: string; contract_node_id?: string; change_id?: string } | null;

		expect({
			attemptKind: attempt?.kind,
			payloadKind: attemptPayload.kind,
			body: attemptPayload.body,
			attempt_kind: attemptPayload.attempt_kind,
			provSource: provRow?.source,
			provActor: provRow?.actor,
			detailAction: provDetail?.action,
			detailSection: provDetail?.section_name,
			detailContractId: provDetail?.contract_node_id,
		}).toEqual({
			attemptKind: 'Attempt',
			payloadKind: 'Attempt',
			body: 'auth section override approved by security review',
			attempt_kind: 'contract_override',
			provSource: 'canvas',
			provActor: 'developer',
			detailAction: 'contract_override',
			detailSection: 'Authentication',
			detailContractId: contractId,
		});
	});

	it('override note >=1 char required (rejects empty)', async () => {
		const contractId = harness.seedContractFixture('api-security');
		await expect(pair.client.sendRequest(RecordContractOverrideRequest, {
			change_id: '01J' + 'C'.repeat(23),
			contract_node_id: contractId,
			section_name: 'Authentication',
			note: '',
		})).rejects.toThrow(/note must be >=1 char/);
	});

	it('writes references edge from Attempt to ContractNode', async () => {
		const contractId = harness.seedContractFixture('design-tokens');
		const result = await pair.client.sendRequest(RecordContractOverrideRequest, {
			change_id: '01J' + 'D'.repeat(23),
			contract_node_id: contractId,
			section_name: 'Color Tokens',
			note: 'temporary override for design refresh sprint',
		});

		const edgeRow = harness.dbHandle.sqlite.prepare(
			`SELECT kind, src_id, dst_id FROM edges WHERE src_id = ? AND dst_id = ?`,
		).get(result.attempt_node_id, contractId) as { kind: string; src_id: string; dst_id: string } | undefined;

		expect({
			edgeKind: edgeRow?.kind,
			edgeSrc: edgeRow?.src_id,
			edgeDst: edgeRow?.dst_id,
		}).toEqual({
			edgeKind: 'references',
			edgeSrc: result.attempt_node_id,
			edgeDst: contractId,
		});
	});

	it('increments contract_overrides metric on harvest_metrics_daily (source=canvas)', async () => {
		const contractId = harness.seedContractFixture('dependency-rules');
		await pair.client.sendRequest(RecordContractOverrideRequest, {
			change_id: '01J' + 'E'.repeat(23),
			contract_node_id: contractId,
			section_name: 'Forbidden Imports',
			note: 'one-shot fuzzy match needed for migration script',
		});
		await pair.client.sendRequest(RecordContractOverrideRequest, {
			change_id: '01J' + 'F'.repeat(23),
			contract_node_id: contractId,
			section_name: 'Forbidden Imports',
			note: 'second override for the same migration sprint',
		});

		const rows = harness.metrics.queryLastDays(7);
		const canvasRow = rows.find(r => r.source === 'canvas');
		expect({
			source: canvasRow?.source,
			contract_overrides: canvasRow?.contract_overrides,
			submitted: canvasRow?.submitted,
			rejected: canvasRow?.rejected_by_filter,
			promoted: canvasRow?.promoted_to_node,
		}).toEqual({
			source: 'canvas',
			contract_overrides: 2,
			submitted: 0,
			rejected: 0,
			promoted: 0,
		});
	});

	it('rejects invalid contract_node_id', async () => {
		await expect(pair.client.sendRequest(RecordContractOverrideRequest, {
			change_id: '01J' + 'G'.repeat(23),
			contract_node_id: '01J' + 'X'.repeat(23),
			section_name: 'Authentication',
			note: 'pointing at a non-existent contract',
		})).rejects.toThrow(/invalid contract_node_id/);

		// Also reject when the id resolves to a non-Contract node kind. Seed a
		// ConstraintNode and try to override it — should still be rejected.
		const seed = harness.dao.seed({
			payload: { kind: 'ConstraintNode', body: 'not a contract', anchor: { file: 'src/x.ts' } },
			provenance: { source: 'cli', actor: 'override-test' },
		});
		await expect(pair.client.sendRequest(RecordContractOverrideRequest, {
			change_id: '01J' + 'H'.repeat(23),
			contract_node_id: seed.id,
			section_name: 'Authentication',
			note: 'wrong-kind id',
		})).rejects.toThrow(/invalid contract_node_id/);
	});

	it('two-tx pattern documented in server.ts handler JSDoc (Pitfall-6 recovery-scan deferral)', () => {
		// Plan 07-06 inherits Plan-04-04 atomicAccept's two-tx pattern: dao.seed (Attempt + provenance
		// in one tx) and dao.writeEdge (references edge in a separate tx). A future Phase-7-iter
		// recovery scan asserts no Attempt(attempt_kind='contract_override') is missing its
		// references edge. Pin the documentation so future plans don't silently coalesce the
		// pattern away.
		const serverPath = resolve(__dirname, '..', '..', 'rpc', 'server.ts');
		const text = readFileSync(serverPath, 'utf8');
		expect({
			mentionsTwoTx: /two-tx/i.test(text),
			mentionsRecoveryScan: /recovery[-\s]?scan/i.test(text),
			mentionsContractOverride: /contract_override/.test(text),
		}).toEqual({
			mentionsTwoTx: true,
			mentionsRecoveryScan: true,
			mentionsContractOverride: true,
		});
	});
});
