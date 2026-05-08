/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/drift/integration/sc4-override-audit.spec.ts — Phase 7 (Plan 07-08)
// ROADMAP success criterion #4 reproduction (DRIFT-06).
//
// Statement: "Developer attempts to override a contract lock and the override path requires
// a written reason that is persisted as an Attempt node of kind contract_override — there
// is no silent escape hatch, and override frequency is itself surfaced as a finding."
//
// Reproduction strategy:
//   (a) Empty-note rejection: invoke graph.recordContractOverride with note='' through the
//       in-process paired-streams RPC harness; assert the request rejects synchronously
//       with a structured error mentioning >=1 char.
//   (b) Valid-note Attempt persistence: invoke with note='fixing critical bug after review';
//       assert dao.queryById(attempt_node_id) returns an Attempt with attempt_kind=
//       'contract_override' + body=note + 'references' edge to the ContractNode + bumped
//       harvest_metrics_daily.contract_overrides counter (source='canvas').
//   (c) CLI surfacing: spawn the built kernel/dist/cli/index.js harvest metrics subprocess
//       against the harness DB; assert stdout shows the overrides column + the canvas
//       7-day rollup line + a WARNING when the override count meets the threshold.
//
// Together these pin DRIFT-06's three parts: (1) Attempt-with-note as the only override path
// (no silent escape hatch); (2) audit-trail edge to the ContractNode; (3) frequency surfacing
// in the goatide-cli harvest metrics opt-in CLI (Pitfall-9 shame-loop defense).

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { Duplex } from 'node:stream';
import * as rpc from 'vscode-jsonrpc/node.js';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { makeDriftHarness, type DriftHarness } from '../_setup.js';
import { ReceiptDAO } from '../../../receipt/index.js';
import { createRpcServer } from '../../../rpc/server.js';
import { RecordContractOverrideRequest } from '../../../rpc/methods.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI_ENTRY = resolve(__dirname, '..', '..', '..', '..', 'dist', 'cli', 'index.js');

beforeAll(() => {
	if (!existsSync(CLI_ENTRY)) {
		throw new Error(`CLI entry missing at ${CLI_ENTRY}; run 'npm run build' before vitest.`);
	}
});

interface PairedStreams {
	clientReader: rpc.MessageReader;
	clientWriter: rpc.MessageWriter;
	serverReader: rpc.MessageReader;
	serverWriter: rpc.MessageWriter;
}

function pairedStreams(): PairedStreams {
	const a = new Duplex({ read() { /* push */ }, write(c, _e, cb) { b.push(c); cb(); } });
	const b = new Duplex({ read() { /* push */ }, write(c, _e, cb) { a.push(c); cb(); } });
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

function runCli(args: string[], extraEnv: Record<string, string> = {}): { code: number; stdout: string; stderr: string } {
	const result = spawnSync(process.execPath, [CLI_ENTRY, ...args], {
		env: { ...process.env, ...extraEnv },
		encoding: 'utf8',
	});
	return {
		code: result.status ?? -1,
		stdout: result.stdout ?? '',
		stderr: result.stderr ?? '',
	};
}

describe('Phase 7 SC #4 — contract override audit trail (DRIFT-06)', () => {
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

	it('override of contract lock writes Attempt(contract_override) with note; cli harvest metrics shows it', async () => {
		const contractId = harness.seedContractFixture('api-security');

		// ----- (a) Empty-note rejection — no silent escape hatch (CANV-03 precedent inherited).
		await expect(pair.client.sendRequest(RecordContractOverrideRequest, {
			change_id: '01J' + 'A'.repeat(23),
			contract_node_id: contractId,
			section_name: 'Authentication',
			note: '',
		})).rejects.toThrow(/note must be >=1 char/);

		// ----- (b) Valid-note Attempt persistence + references edge + metric bump.
		const overrideResult = await pair.client.sendRequest(RecordContractOverrideRequest, {
			change_id: '01J' + 'B'.repeat(23),
			contract_node_id: contractId,
			section_name: 'Authentication',
			note: 'fixing critical bug after security review',
		});
		expect(typeof overrideResult.attempt_node_id).toBe('string');
		expect(overrideResult.attempt_node_id.length).toBeGreaterThan(0);

		// Attempt node persisted with attempt_kind='contract_override' + body=note.
		const attempt = harness.dao.queryById(overrideResult.attempt_node_id);
		expect(attempt).not.toBeNull();
		expect(attempt!.kind).toBe('Attempt');
		const attemptPayload = attempt!.payload as { kind: string; body: string; attempt_kind?: string };
		expect(attemptPayload.attempt_kind).toBe('contract_override');
		expect(attemptPayload.body).toBe('fixing critical bug after security review');

		// references edge from the Attempt to the ContractNode.
		const edgeRow = harness.dbHandle.sqlite.prepare(
			`SELECT kind, src_id, dst_id FROM edges WHERE src_id = ? AND dst_id = ?`,
		).get(overrideResult.attempt_node_id, contractId) as { kind: string; src_id: string; dst_id: string } | undefined;
		expect(edgeRow).toBeDefined();
		expect(edgeRow!.kind).toBe('references');

		// Provenance carries the action/section/contract for audit trail.
		const provRow = harness.dao.queryProvenance(overrideResult.attempt_node_id);
		expect(provRow).not.toBeNull();
		expect(provRow!.source).toBe('canvas');
		const provDetail = provRow!.detail as { action?: string; section_name?: string; contract_node_id?: string } | null;
		expect(provDetail?.action).toBe('contract_override');
		expect(provDetail?.section_name).toBe('Authentication');
		expect(provDetail?.contract_node_id).toBe(contractId);

		// Metric counter bumped for source='canvas'.
		const metricsRows = harness.metrics.queryLastDays(7);
		const canvasRow = metricsRows.find((r) => r.source === 'canvas');
		expect(canvasRow).toBeDefined();
		expect(canvasRow!.contract_overrides).toBeGreaterThanOrEqual(1);

		// ----- (c) Seed enough additional overrides to trip the default threshold (5), then
		// invoke the CLI subprocess and assert the overrides column + 7-day rollup + WARNING.
		// We add 5 more so we sit at >= 6 total today (above default threshold 5).
		for (let i = 0; i < 5; i++) {
			await pair.client.sendRequest(RecordContractOverrideRequest, {
				change_id: '01J' + i.toString().padStart(2, '0') + 'C'.repeat(21),
				contract_node_id: contractId,
				section_name: 'Authentication',
				note: `bulk override ${i} for SC4 frequency surfacing`,
			});
		}

		const cli = runCli(
			['harvest', 'metrics', '--days', '7'],
			{ GOATIDE_DB: harness.tmp.dbPath, GOATIDE_NOW_OVERRIDE_ISO: new Date().toISOString() },
		);
		expect(cli.code).toBe(0);
		// overrides column header (case-insensitive) + canvas row + 7-day rollup line.
		expect(/overrides/i.test(cli.stdout)).toBe(true);
		expect(/canvas/.test(cli.stdout)).toBe(true);
		// canvas overrides (last 7d): N — Plan 07-06 prose; threshold WARNING fires when >= 5.
		expect(/canvas overrides/i.test(cli.stdout)).toBe(true);
		expect(/WARNING.*contract overrides/i.test(cli.stdout)).toBe(true);

		// Raise threshold to suppress the WARNING and confirm rollup line still shows
		// (Pitfall-9 shame-loop defense: rollup is informative, threshold is calibration).
		const cliRaised = runCli(
			['harvest', 'metrics', '--days', '7'],
			{
				GOATIDE_DB: harness.tmp.dbPath,
				GOATIDE_NOW_OVERRIDE_ISO: new Date().toISOString(),
				GOATIDE_DRIFT_OVERRIDE_THRESHOLD: '100',
			},
		);
		expect(cliRaised.code).toBe(0);
		expect(/canvas overrides/i.test(cliRaised.stdout)).toBe(true);
		expect(/WARNING.*contract overrides/i.test(cliRaised.stdout)).toBe(false);
	});
});
