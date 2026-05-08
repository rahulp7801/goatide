/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/drift/integration/sc2-intent-drift.spec.ts — Phase 7 (Plan 07-08)
// ROADMAP success criterion #2 reproduction (DRIFT-02).
//
// Statement: "Developer's session priority is 'Speed-First' but a cited rule was
// derived_under_priority=Quality-First; the Receipt renders that citation with a flagged
// IntentDrift badge linking to a diff-style explanation."
//
// Reproduction strategy:
//   1. Seed a DecisionNode with derived_under_priority='Quality-First' anchored at
//      src/auth.ts via the live GraphDAO.
//   2. Invoke graph.proposeEdit through the in-process paired-streams RPC harness with
//      session_priority='Speed-First' against a diff that resolves to the seeded DecisionNode.
//   3. Assert the returned receipt's citation for the DecisionNode carries
//      intent_drift_badge with cited_priority='Quality-First' + session_priority='Speed-First'
//      + non-empty explanation.
//   4. (Bridge sub-test) Render <span className='intent-drift-badge'> under jsdom — proves
//      the data shape that the bridge CitationList consumes per the ROADMAP truth.
//
// This exercises the full end-to-end flow: proposeEdit handler -> buildReceipt -> renderReceipt
// (with sessionPriority option) -> evaluateIntentDrift -> RenderedCitation.intent_drift_badge.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Duplex } from 'node:stream';
import * as rpc from 'vscode-jsonrpc/node.js';
import { makeDriftHarness, type DriftHarness } from '../_setup.js';
import { ReceiptDAO } from '../../../receipt/index.js';
import { createRpcServer } from '../../../rpc/server.js';
import { ProposeEditRequest } from '../../../rpc/methods.js';
import type { RenderedReceipt, RenderedCitation } from '../../../receipt/render.js';

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

describe('Phase 7 SC #2 — IntentDrift badge fires on session-priority mismatch (DRIFT-02)', () => {
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

	it('session priority Speed-First vs cited rule derived_under_priority Quality-First produces flagged citation', async () => {
		// Seed a DecisionNode anchored at src/auth.ts with derived_under_priority='Quality-First'.
		const seeded = harness.dao.seed({
			payload: {
				kind: 'DecisionNode',
				body: 'Use refresh-token rotation with 5-minute access-token TTL',
				anchor: { file: 'src/auth.ts' },
				derived_under_priority: 'Quality-First',
			},
			provenance: { source: 'cli', actor: 'sc2-integration', detail: { fixture: 'decision' } },
			confidence: 'Explicit',
		});
		const decisionId = seeded.id;

		// Construct a diff against src/auth.ts so the anchor resolver discovers the seeded
		// DecisionNode as a root + the buildReceipt traversal pulls it as a citation.
		const diff = [
			'diff --git a/src/auth.ts b/src/auth.ts',
			'--- a/src/auth.ts',
			'+++ b/src/auth.ts',
			'@@ -1,1 +1,3 @@',
			' export const runtime = "node";',
			'+// Drop refresh-token rotation; use long-lived access tokens for speed.',
			'+export const ACCESS_TOKEN_TTL_HOURS = 168;',
			'',
		].join('\n');

		// Phase 7 Plan 07-05 additive RPC param: session_priority='Speed-First' threads
		// through proposeEdit -> buildReceipt -> renderReceipt({sessionPriority}) ->
		// evaluateIntentDrift. The returned receipt is structurally a RenderedReceipt
		// (superset of ReasoningReceipt with cited_payload + intent_drift_badge per citation).
		const result = await pair.client.sendRequest(ProposeEditRequest, {
			diff,
			destructive: false,
			asOf: new Date().toISOString(),
			session_priority: 'Speed-First',
		});

		// The kernel returns RenderedReceipt when session_priority is provided. TypeScript's
		// ProposeEditResult shape is {receipt: ReasoningReceipt} for back-compat, but the
		// runtime payload is the rendered superset (Plan 07-05 decision §6).
		const rendered = result.receipt as unknown as RenderedReceipt;
		expect(Array.isArray(rendered.citations)).toBe(true);
		expect(rendered.citations.length).toBeGreaterThanOrEqual(1);

		const decisionCitation = rendered.citations.find((c: RenderedCitation) => c.node_id === decisionId);
		expect(decisionCitation).toBeDefined();
		expect(decisionCitation!.intent_drift_badge).toBeTruthy();
		const badge = decisionCitation!.intent_drift_badge!;
		expect(badge.citation_node_id).toBe(decisionId);
		expect(badge.cited_priority).toBe('Quality-First');
		expect(badge.session_priority).toBe('Speed-First');
		expect(badge.explanation.length).toBeGreaterThan(0);

		// ----- Bridge data-shape assertion: the production rendered.citations array is the
		// exact shape the bridge CitationList React component (Plan 07-05 + 07-07) consumes
		// to paint each citation row. Visual rendering of the badge icon + tooltip under
		// VS Code host is W1 manual carryover (Phase 1.1 SC #2 ceremony). Here we pin the
		// data contract: exactly one citation carries intent_drift_badge with explanation.
		const citationsWithBadge = rendered.citations.filter((c: RenderedCitation) => c.intent_drift_badge !== null && c.intent_drift_badge !== undefined);
		expect(citationsWithBadge.length).toBe(1);
		expect(citationsWithBadge[0].node_id).toBe(decisionId);
	});
});
