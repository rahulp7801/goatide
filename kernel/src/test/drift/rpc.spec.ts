/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/drift/rpc.spec.ts — Phase 7 (Plan 07-07) DRIFT-01 + DRIFT-03 + DRIFT-04 +
// DRIFT-05 RPC surface tests.
//
// Two new RPC methods bridge kernel drift surface to the bridge save-gate:
//   - graph.runDriftAndLock — runs runDriftDetector + detectsContractLock against a diff.
//   - graph.runRippleProgressive — emits a graph.driftProgress notification mid-flight, then
//     returns the maxHops=3 final ComplianceReport.
//
// Tests use the in-process paired-streams RPC harness (mirrors override.spec.ts pattern from
// Plan 07-06).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Duplex } from 'node:stream';
import * as rpc from 'vscode-jsonrpc/node.js';
import { makeDriftHarness, type DriftHarness } from './_setup.js';
import { ReceiptDAO } from '../../receipt/index.js';
import { createRpcServer } from '../../rpc/server.js';
import {
	RunDriftAndLockRequest,
	RunRippleProgressiveRequest,
	DriftProgressNotificationType,
	type DriftProgressNotification,
} from '../../rpc/methods.js';

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

describe('drift/rpc — Plan 07-07 (graph.runDriftAndLock + graph.runRippleProgressive)', () => {
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

	// ----- graph.runDriftAndLock -----

	it('graph.runDriftAndLock returns empty arrays for a clean diff with no contracts loaded', async () => {
		const result = await pair.client.sendRequest(RunDriftAndLockRequest, {
			diff: 'diff --git a/src/x.ts b/src/x.ts\n--- a/src/x.ts\n+++ b/src/x.ts\n@@ -1,1 +1,2 @@\n const a = 1;\n+const b = 2;\n',
			asOf: new Date().toISOString(),
		});
		expect(result).toEqual({ drift_findings: [], lock_trigger: null });
	});

	it('graph.runDriftAndLock returns drift_findings when diff violates a registered pattern', async () => {
		harness.seedContractFixture('dependency-rules');
		// dependency-rules anchor is /contracts/dependency_rules.md; forbidden_import patterns
		// fire when the file matches anchor (anchor-defaulting). Diff edits the contract file
		// itself with a banned import.
		const diff = [
			"diff --git a/contracts/dependency_rules.md b/contracts/dependency_rules.md",
			"--- a/contracts/dependency_rules.md",
			"+++ b/contracts/dependency_rules.md",
			"@@ -1,1 +1,2 @@",
			" some content",
			"+import x from 'string-similarity';",
			"",
		].join('\n');
		const result = await pair.client.sendRequest(RunDriftAndLockRequest, {
			diff,
			asOf: new Date().toISOString(),
		});
		expect(result.drift_findings.length).toBeGreaterThan(0);
		expect(result.drift_findings[0].pattern_kind).toBe('forbidden_import');
	});

	it('graph.runDriftAndLock returns lock_trigger when diff edits an enforcing section', async () => {
		const contractId = harness.seedContractFixture('api-security');
		// Build a diff against /contracts/api_security.md targeting the Authentication section.
		// The fixture's body has Authentication starting around line 7; we replace lines in
		// that range. parsePatch is strict — paired -/+ lines required.
		const diff = [
			"diff --git a/contracts/api_security.md b/contracts/api_security.md",
			"--- a/contracts/api_security.md",
			"+++ b/contracts/api_security.md",
			"@@ -7,3 +7,3 @@",
			"-## Authentication",
			"-",
			"-All routes MUST call `requireAuth()` before any business logic. The detector enforces",
			"+## Authentication (revised)",
			"+",
			"+All routes MUST call `requireAuth()` before business logic — fully restated.",
			"",
		].join('\n');
		const result = await pair.client.sendRequest(RunDriftAndLockRequest, {
			diff,
			asOf: new Date().toISOString(),
		});
		expect(result.lock_trigger).not.toBeNull();
		expect(result.lock_trigger!.contract_node_id).toBe(contractId);
		expect(result.lock_trigger!.section_name).toBe('Authentication');
	});

	// ----- graph.runRippleProgressive -----

	it('graph.runRippleProgressive emits ONE graph.driftProgress notification before final response', async () => {
		const contractId = harness.seedContractFixture('api-security');
		const captured: DriftProgressNotification[] = [];
		pair.client.onNotification(DriftProgressNotificationType, (n) => {
			captured.push(n);
		});

		const final = await pair.client.sendRequest(RunRippleProgressiveRequest, {
			contract_node_id: contractId,
			asOf: new Date().toISOString(),
		});

		// We assert the final report shape AND that we observed at least one progress event
		// with hops_complete=1 BEFORE the final. The notification arrival is asynchronous
		// w.r.t. test code, but the JSON-RPC framing guarantees the notification is dispatched
		// before the final response arrives on the client read loop. By the time the await
		// resolves, the notification listener has already run.
		expect(captured.length).toBeGreaterThanOrEqual(1);
		expect(captured[0].hops_complete).toBe(1);
		expect(final.report.contract_node_id).toBe(contractId);
		expect(final.report.max_hops).toBe(3);
	});

	it('graph.runRippleProgressive returns final report with maxHops=3 + tri-bucket arrays', async () => {
		const contractId = harness.seedContractFixture('design-tokens');
		const result = await pair.client.sendRequest(RunRippleProgressiveRequest, {
			contract_node_id: contractId,
			asOf: new Date().toISOString(),
		});
		expect(result.report.max_hops).toBe(3);
		expect(Array.isArray(result.report.definitely_affected)).toBe(true);
		expect(Array.isArray(result.report.potentially_affected)).toBe(true);
		expect(typeof result.report.truncated).toBe('boolean');
		expect(typeof result.report.generated_at).toBe('string');
		expect(result.report.contract_node_id).toBe(contractId);
	});
});
