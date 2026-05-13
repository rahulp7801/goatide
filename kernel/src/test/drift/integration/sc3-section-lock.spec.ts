/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/drift/integration/sc3-section-lock.spec.ts — Phase 7 (Plan 07-08)
// ROADMAP success criterion #3 reproduction (DRIFT-03 + DRIFT-04).
//
// Statement: "Developer fixes a typo in a non-enforcing section of /contracts/api_security.md
// — the lock passes silently with no ripple report; developer edits an enforcing section —
// the lock triggers, a tri-bucket report renders first-degree dependencies synchronously, and
// deeper hops load in the background with a progress indicator."
//
// Reproduction strategy:
//   (a) Cosmetic edit case: construct a unified diff editing only the ## Notes section of
//       /contracts/api_security.md; invoke graph.runDriftAndLock; assert lock_trigger=null.
//   (b) Enforcing edit case: edit ## Authentication; invoke graph.runDriftAndLock; assert
//       lock_trigger non-null with section_name='Authentication'. Then invoke
//       graph.runRippleProgressive with the seeded contract; assert the partial first-degree
//       notification arrives BEFORE the awaited final + final report has the tri-bucket
//       shape (definitely_affected + potentially_affected arrays).
//   (c) Bridge sub-test: render the tri-bucket ComplianceReport under jsdom — proves the
//       data shape that the bridge ComplianceReport modal consumes.
//
// Pins SC #3's "cosmetic-pass-silent" invariant (Plan 07-03 lock-detector contract) AND the
// progressive-disclosure ordering invariant (Plan 07-04 + 07-07 ripple-progressive contract)
// AND the tri-bucket data shape (Plan 07-04 ComplianceReport).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Duplex } from 'node:stream';
import * as rpc from 'vscode-jsonrpc/node.js';
import { makeDriftHarness, type DriftHarness } from '../_setup.js';
import { ReceiptDAO } from '../../../receipt/index.js';
import { createRpcServer } from '../../../rpc/server.js';
import {
	RunDriftAndLockRequest,
	RunRippleProgressiveRequest,
	DriftProgressNotificationType,
	type DriftProgressNotification,
} from '../../../rpc/methods.js';

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

describe('Phase 7 SC #3 — enforcing-section edit triggers tri-bucket lock (DRIFT-03 + DRIFT-04)', () => {
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

	it('cosmetic edit to /contracts/api_security.md passes silently; enforcing-section edit triggers tri-bucket lock', async () => {
		const contractId = harness.seedContractFixture('api-security');

		// Seed a couple of downstream nodes so the ripple report has rows to bucket. The
		// edges connect the ContractNode to ConstraintNodes via 'protects' (definitely)
		// and 'references' (potentially) so the tri-bucket assertion has substance.
		//
		// CLOSE-03 fix (13-03): capture asOf AFTER all seeding completes rather than before.
		// The original code captured seedTs = new Date() BEFORE the 4 synchronous SQLite
		// writes, then set asOf = seedTs + 10ms. Under full-suite load (108 spec files, fork
		// contention, OS I/O pressure) the 4 writes can take >10ms, making asOf < valid_from
		// for the seeded nodes. The bitemporal filter then excludes them from the ripple
		// analysis (totalRows = 0), failing the >=2 assertion. This is the order-dependent
		// flake documented in REQUIREMENTS.md CLOSE-03.
		//
		// Fix: asOf is captured after the last write completes. The +1ms ensures asOf is
		// strictly greater than all valid_from values recorded by the synchronous writes
		// above, satisfying valid_from <= asOf unconditionally regardless of system load.
		const protectsTarget = harness.dao.seed({
			payload: { kind: 'ConstraintNode', body: 'auth-route handler must call requireAuth', anchor: { file: 'src/app/api/users/route.ts' } },
			provenance: { source: 'cli', actor: 'sc3-integration', detail: { variant: 'protects' } },
		});
		const referencesTarget = harness.dao.seed({
			payload: { kind: 'ConstraintNode', body: 'auth helper module', anchor: { file: 'src/auth.ts' } },
			provenance: { source: 'cli', actor: 'sc3-integration', detail: { variant: 'references' } },
		});
		harness.dao.writeEdge({ kind: 'protects', src_id: contractId, dst_id: protectsTarget.id });
		harness.dao.writeEdge({ kind: 'references', src_id: contractId, dst_id: referencesTarget.id });
		// asOf is captured AFTER all seeding so valid_from <= asOf is always satisfied,
		// regardless of how long the synchronous SQLite writes take under suite load.
		const asOf = new Date(Date.now() + 1).toISOString();

		// ----- (a) Cosmetic edit: ## Notes is non-enforcing → lock_trigger MUST be null.
		// api-security.md has ## Notes at line 25 (1-indexed); a small edit there exercises
		// the cosmetic-pass-silent invariant (Plan 07-03 SC #3 prose).
		const cosmeticDiff = [
			'diff --git a//contracts/api_security.md b//contracts/api_security.md',
			'--- a//contracts/api_security.md',
			'+++ b//contracts/api_security.md',
			'@@ -25,2 +25,2 @@',
			'-## Notes',
			'-',
			'+## Notes (clarified)',
			'+',
			'',
		].join('\n');
		const cosmeticResult = await pair.client.sendRequest(RunDriftAndLockRequest, {
			diff: cosmeticDiff,
			asOf,
		});
		expect(cosmeticResult.lock_trigger).toBeNull();

		// ----- (b) Enforcing edit: ## Authentication is enforcing → lock_trigger MUST fire.
		// The api-security fixture's ## Authentication heading is at line 7 (1-indexed). The
		// hunk is paired -/+ so parsePatch is happy (Plan 07-03 lock-detector spec pattern).
		const enforcingDiff = [
			'diff --git a//contracts/api_security.md b//contracts/api_security.md',
			'--- a//contracts/api_security.md',
			'+++ b//contracts/api_security.md',
			'@@ -7,2 +7,2 @@',
			'-## Authentication',
			'-',
			'+## Authentication (revised)',
			'+',
			'',
		].join('\n');
		const enforcingResult = await pair.client.sendRequest(RunDriftAndLockRequest, {
			diff: enforcingDiff,
			asOf,
		});
		expect(enforcingResult.lock_trigger).not.toBeNull();
		expect(enforcingResult.lock_trigger!.contract_node_id).toBe(contractId);
		expect(enforcingResult.lock_trigger!.section_name).toBe('Authentication');

		// ----- (c) Tri-bucket ripple via runRippleProgressive: notification ordering invariant.
		// Plan 07-07 contract: the kernel emits graph.driftProgress with hops_complete=1 BEFORE
		// the awaited Promise resolves. The bridge save-gate races this against a 50ms timeout
		// to avoid blocking dispatch. We capture notifications via onNotification and then
		// assert the final report's tri-bucket shape.
		const captured: DriftProgressNotification[] = [];
		pair.client.onNotification(DriftProgressNotificationType, (n) => {
			captured.push(n);
		});
		const rippleResult = await pair.client.sendRequest(RunRippleProgressiveRequest, {
			contract_node_id: contractId,
			asOf,
		});
		expect(captured.length).toBeGreaterThanOrEqual(1);
		expect(captured[0].hops_complete).toBe(1);
		expect(rippleResult.report.contract_node_id).toBe(contractId);
		expect(rippleResult.report.max_hops).toBe(3);
		// Tri-bucket assertion: definitely_affected (protects edges) + potentially_affected
		// (references / parent_of edges) + truncated:false on this small fixture.
		expect(Array.isArray(rippleResult.report.definitely_affected)).toBe(true);
		expect(Array.isArray(rippleResult.report.potentially_affected)).toBe(true);
		expect(rippleResult.report.truncated).toBe(false);
		const totalRows = rippleResult.report.definitely_affected.length + rippleResult.report.potentially_affected.length;
		expect(totalRows).toBeGreaterThanOrEqual(2);
		const definitelyIds = rippleResult.report.definitely_affected.map((r) => r.node_id);
		const potentiallyIds = rippleResult.report.potentially_affected.map((r) => r.node_id);
		expect(definitelyIds).toContain(protectsTarget.id);
		expect(potentiallyIds).toContain(referencesTarget.id);

		// ----- Bridge data-shape assertion: the production tri-bucket report is the exact
		// shape the bridge ComplianceReport React component (Plan 07-07 + 07-01 shell)
		// consumes to paint three labeled sections (Definitely / Potentially / Loading
		// deeper hops). Visual layer (CSS transitions, spinner timing, ThemeColor) is W1
		// manual carryover (Phase 1.1 SC #2 ceremony). Here we pin the data contract.
		for (const row of [...rippleResult.report.definitely_affected, ...rippleResult.report.potentially_affected]) {
			expect(typeof row.node_id).toBe('string');
			expect(typeof row.kind).toBe('string');
			expect(typeof row.body_preview).toBe('string');
			expect(row.hops).toBeGreaterThanOrEqual(1);
			expect(row.hops).toBeLessThanOrEqual(3);
		}
	});
});
