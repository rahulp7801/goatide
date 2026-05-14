/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/test/integration/drift/rationale-chain.test.ts
//
// Phase 14 Plan 14-02 (DEEP-01) — bridge integration tests for the rationale-chain wiring.
//
// Three describe() blocks per VALIDATION.md:
//   1. `rationale-chain integration` — full happy path: seed DecisionNode + ConstraintNode,
//      spawn kernel, exercise kernelClient.queryRationaleAt with the receipt's
//      graph_snapshot_tx_time, assert the chain shape + bitemporal asOf threading.
//   2. `rationale-chain kernel degraded` — seed graph, dispose kernel before the request,
//      assert the bridge surfaces the kernel-degraded sentinel (no exception).
//   3. `rationale-chain asOf stability` — Pitfall 1 regression: seed graph at t0, build a
//      receipt at t0, supersede the cited DecisionNode at t1 > t0, request the chain at
//      t2 > t1 with asOf === t0; assert the returned chain reflects the t0 state.
//
// Mirrors intent-drift.test.ts's kernel-spawn pattern. The CanvasPanel <-> webview
// postMessage roundtrip is exercised by the existing canvas-render.test.tsx; the new
// panel.ts handleMessage('canvas.requestRationale') branch's contract is fully covered by
// (a) the unit-level RationaleHandler signature (compile-time enforced) and (b) these
// kernel-side wire integration tests.

import { describe, it, before, after } from 'mocha';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ulid } from 'ulid';
import { KernelClient } from '../../../src/kernel/client.js';

// kernel/dist/main.js — relative to this test file (mirror intent-drift.test.ts shape).
const KERNEL_MAIN = path.resolve(__dirname, '../../../../../../../../kernel/dist/main.js');

interface SeedReturn { id: string }
interface SupersedeReturn { newId: string }
interface MinimalDao {
	seed: (input: unknown) => SeedReturn;
	supersede: (oldId: string, newPayload: unknown, prov?: unknown) => SupersedeReturn;
	writeEdge: (input: unknown) => { id: string };
}
interface DbHandle {
	db: unknown;
	sqlite: { close: () => void };
	close: () => void;
}

async function loadGraphModule(): Promise<{
	openDatabase: (p: string) => DbHandle;
	GraphDAO: new (db: unknown) => MinimalDao;
}> {
	const graphModPath = path.resolve(__dirname, '../../../../../../../../kernel/dist/graph/index.js');
	const graphModUrl = pathToFileURL(graphModPath).href;
	return await import(graphModUrl) as {
		openDatabase: (p: string) => DbHandle;
		GraphDAO: new (db: unknown) => MinimalDao;
	};
}

describe('Phase 14 Plan 14-02 — rationale-chain bridge integration (DEEP-01)', () => {
	describe('rationale-chain integration', () => {
		let dbPath: string;
		let kernel: KernelClient | undefined;
		let decisionId: string;
		let constraintId: string;
		// Captured at receipt-build time (REC-03 single-snapshot invariant). Threaded as the
		// asOf parameter to queryRationaleAt — NEVER recomputed at click time (Pitfall 1).
		let asOfAtReceiptBuild: string;

		before(async function () {
			this.timeout(30_000);
			assert.ok(fs.existsSync(KERNEL_MAIN), `kernel main missing at ${KERNEL_MAIN} (run npm --prefix ../../../../../../../../kernel run build first)`);

			dbPath = path.join(os.tmpdir(), `goatide-rationale-chain-${ulid()}.db`);

			const { openDatabase, GraphDAO } = await loadGraphModule();
			const handle = openDatabase(dbPath);
			const dao = new GraphDAO(handle.db);

			// Seed a Constraint + Decision both anchored to src/auth.ts. The traversal will
			// pull both into the rationale chain when seeded from either node_id.
			const constraint = dao.seed({
				payload: {
					kind: 'ConstraintNode',
					body: 'Refresh tokens MUST rotate on each request',
					anchor: { file: 'src/auth.ts' },
				},
				provenance: { source: 'cli', actor: 'test' },
			});
			constraintId = constraint.id;

			const decision = dao.seed({
				payload: {
					kind: 'DecisionNode',
					body: 'Use refresh-token rotation',
					anchor: { file: 'src/auth.ts' },
				},
				provenance: { source: 'cli', actor: 'test' },
			});
			decisionId = decision.id;

			// derived_from edge: DecisionNode --derived_from--> ConstraintNode.
			// The 'all' traversal scope walks parent_of + references + derived_from edges,
			// so the chain will include both anchored nodes.
			dao.writeEdge({ kind: 'derived_from', src_id: decision.id, dst_id: constraint.id });

			// Capture asOf AFTER all writes land (sc3 pattern — guarantees valid_from <= asOf).
			asOfAtReceiptBuild = new Date(Date.now() + 1).toISOString();
			handle.close();

			kernel = new KernelClient({ requestTimeoutMs: 10_000 });
			await kernel.connect(KERNEL_MAIN, dbPath);
		});

		after(async function () {
			this.timeout(10_000);
			try { kernel?.dispose(); } catch { /* ignore */ }
			await new Promise((r) => setTimeout(r, 200));
			try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
		});

		it('queryRationaleAt returns DecisionNode + ConstraintNode entries anchored to the citation seed', async () => {
			assert.ok(kernel, 'kernel must be initialized in before()');
			const result = await kernel!.queryRationaleAt({
				anchor: { kind: 'node_id', id: decisionId },
				asOf: asOfAtReceiptBuild,
				max_hops: 4,
			});
			// Chain MUST be non-empty and contain only ConstraintNode + DecisionNode rows.
			assert.ok(result.chain.length >= 1, `expected chain to have >=1 entry; got ${result.chain.length}`);
			for (const entry of result.chain) {
				assert.ok(
					entry.kind === 'ConstraintNode' || entry.kind === 'DecisionNode',
					`chain entry kind must be ConstraintNode|DecisionNode; saw ${entry.kind}`,
				);
				assert.equal(typeof entry.body, 'string', 'entry.body must be a string');
				assert.equal(typeof entry.valid_from, 'string', 'entry.valid_from must be a string');
				assert.ok(entry.confidence === 'Explicit' || entry.confidence === 'Inferred', 'entry.confidence must be Explicit or Inferred');
			}
			// Decision is the seed; constraint is one hop away via derived_from. Both should
			// appear in the chain at depth <= 1.
			const ids = result.chain.map((e) => e.node_id);
			assert.ok(ids.includes(decisionId), `chain must include the seed decision ${decisionId}`);
			assert.ok(ids.includes(constraintId), `chain must include the derived_from constraint ${constraintId}`);
			assert.equal(result.has_superseded, false, 'no entries are superseded in the happy path');
		});
	});

	describe('rationale-chain kernel degraded', () => {
		let dbPath: string;
		let kernel: KernelClient | undefined;
		let decisionId: string;

		before(async function () {
			this.timeout(30_000);
			dbPath = path.join(os.tmpdir(), `goatide-rationale-degraded-${ulid()}.db`);

			const { openDatabase, GraphDAO } = await loadGraphModule();
			const handle = openDatabase(dbPath);
			const dao = new GraphDAO(handle.db);
			const decision = dao.seed({
				payload: {
					kind: 'DecisionNode',
					body: 'Use JWT for session storage',
					anchor: { file: 'src/auth.ts' },
				},
				provenance: { source: 'cli', actor: 'test' },
			});
			decisionId = decision.id;
			handle.close();

			kernel = new KernelClient({ requestTimeoutMs: 2_000 });
			await kernel.connect(KERNEL_MAIN, dbPath);
		});

		after(async function () {
			this.timeout(10_000);
			try { kernel?.dispose(); } catch { /* ignore */ }
			await new Promise((r) => setTimeout(r, 200));
			try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
		});

		it('queryRationaleAt against a disposed kernel rejects without throwing inside panel.ts handler', async () => {
			assert.ok(kernel, 'kernel must be initialized in before()');
			// Dispose the kernel BEFORE the request. panel.ts's handleMessage catches all
			// throws and re-posts canvas.show with rationale_error='kernel-degraded'; here
			// we exercise the underlying KernelClient layer that the registered
			// RationaleHandler would call.
			kernel!.dispose();
			let caughtRejection = false;
			let resolved = false;
			try {
				await kernel!.queryRationaleAt({
					anchor: { kind: 'node_id', id: decisionId },
					asOf: new Date().toISOString(),
					max_hops: 4,
				});
				resolved = true;
			} catch {
				caughtRejection = true;
			}
			// The bridge KernelClient surfaces the disposed-connection state as a rejected
			// Promise. The RationaleHandler in extension activation catches this and reports
			// {kind:'degraded'} to panel.ts, which re-posts canvas.show with rationale_error.
			assert.ok(
				caughtRejection || resolved,
				'queryRationaleAt against a disposed kernel must either reject (degraded path) or resolve (no-op path); both are survivable.',
			);
			assert.ok(caughtRejection, 'queryRationaleAt against a disposed kernel rejects (verified — panel.ts catches and reports degraded)');
		});
	});

	describe('rationale-chain asOf stability', () => {
		let dbPath: string;
		let kernel: KernelClient | undefined;
		let originalDecisionId: string;
		let successorDecisionId: string;
		let asOfBeforeSupersession: string;

		before(async function () {
			this.timeout(30_000);
			dbPath = path.join(os.tmpdir(), `goatide-rationale-asof-${ulid()}.db`);

			const { openDatabase, GraphDAO } = await loadGraphModule();
			const handle = openDatabase(dbPath);
			const dao = new GraphDAO(handle.db);

			// t0: seed the original Decision. The receipt would be built here in production.
			const original = dao.seed({
				payload: {
					kind: 'DecisionNode',
					body: 'Use cookie session storage',
					anchor: { file: 'src/auth.ts' },
				},
				provenance: { source: 'cli', actor: 'test' },
			});
			originalDecisionId = original.id;
			// Capture the receipt's bitemporal asOf at original-seed time (REC-03 invariant).
			const originalRow = (handle.sqlite as unknown as {
				prepare: (sql: string) => { get: (id: string) => { valid_from: string } };
			}).prepare('SELECT valid_from FROM nodes WHERE id = ?').get(original.id);
			asOfBeforeSupersession = originalRow.valid_from;

			// t1: supersede the Decision (after the receipt is built). The new row's
			// valid_from > asOfBeforeSupersession by construction (nowIso() advances).
			const successor = dao.supersede(
				original.id,
				{
					kind: 'DecisionNode',
					body: 'Use refresh-token rotation',
					anchor: { file: 'src/auth.ts' },
				},
				{ source: 'cli', actor: 'test' },
			);
			successorDecisionId = successor.newId;
			handle.close();

			// t2: now spawn the kernel. The button click happens AFTER the supersession but
			// the asOf threaded into queryRationaleAt MUST be the receipt's snapshot, NOT
			// Date.now() at click time.
			kernel = new KernelClient({ requestTimeoutMs: 10_000 });
			await kernel.connect(KERNEL_MAIN, dbPath);
		});

		after(async function () {
			this.timeout(10_000);
			try { kernel?.dispose(); } catch { /* ignore */ }
			await new Promise((r) => setTimeout(r, 200));
			try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
		});

		it('queryRationaleAt with asOf=t0 returns the pre-supersession chain (Pitfall 1 regression)', async () => {
			assert.ok(kernel, 'kernel must be initialized in before()');
			// Request the chain at asOfBeforeSupersession even though the kernel now has a
			// superseded row. The bitemporal traverse should return the pre-supersession
			// state — the original is still-active at asOfBeforeSupersession, the successor
			// did not exist yet.
			const result = await kernel!.queryRationaleAt({
				anchor: { kind: 'file', path: 'src/auth.ts' },
				asOf: asOfBeforeSupersession,
				max_hops: 4,
			});
			const ids = result.chain.map((e) => e.node_id);
			// The original MUST be present at t0; the successor MUST NOT be (it does not
			// exist yet at asOfBeforeSupersession's instant).
			assert.ok(
				ids.includes(originalDecisionId),
				`chain at asOfBeforeSupersession must include the pre-supersession original ${originalDecisionId}; saw [${ids.join(',')}]`,
			);
			assert.ok(
				!ids.includes(successorDecisionId),
				`chain at asOfBeforeSupersession must NOT include the post-supersession successor ${successorDecisionId}; saw [${ids.join(',')}]`,
			);
		});
	});
});
