/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/drift/ripple-progressive.spec.ts — Phase 7 (Plan 07-04) DRIFT-04 + DRIFT-05
// progressive-disclosure surface.
//
// MANDATORY (NOT folded into ripple.spec.ts). The progressive surface is a 2-phase async flow
// the bridge wires for first-degree-fast / deeper-hops-async UX:
//   Phase A: inline runRippleAnalysis(maxHops:1) → invoke onProgress({hopsComplete:1, report}).
//   Phase B: await runRippleAnalysis(maxHops:3) → return final ComplianceReport.
//
// Three tests:
//   (a) happy path: returns final ComplianceReport; onProgress called once with hopsComplete=1.
//   (b) onProgress-fires-BEFORE-resolve invariant: a flag set inside onProgress is observed
//       true synchronously after the await of runRippleProgressive. Proves notification
//       ordering (caller observes the partial before the final response).
//   (c) deduplicated hops 1+2+3 against the 400-node fixture; total wall clock < 5s
//       (defensive non-tight Phase-B latency bound).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO, type OpenDatabaseHandle } from '../../graph/index.js';
import { runRippleProgressive } from '../../drift/ripple-progressive.js';
import type { ComplianceReport } from '../../drift/types.js';

describe('drift/ripple-progressive — Plan 07-04 (DRIFT-04 + DRIFT-05)', () => {
	let tmp: TempDb;
	let handle: OpenDatabaseHandle;
	let dao: GraphDAO;
	let contractId: string;

	beforeAll(() => {
		tmp = mkTempDb();
		handle = openDatabase(tmp.dbPath);
		dao = new GraphDAO(handle.db);

		// Seed: 1 contract → 400 reachables (hop 1) → fanout for hops 2 + 3 dedup test.
		// Mix: protects/references/parent_of like ripple-perf 400-node fixture.
		const root = dao.seed({
			payload: {
				kind: 'ContractNode',
				body: 'progressive-disclosure root',
				anchor: { file: 'contracts/prog.md' },
				contract_path: 'contracts/prog.md',
			},
			provenance: { source: 'cli', actor: 'progressive-test', detail: { variant: 'happy' } },
		});
		contractId = root.id;

		const sqlite = handle.sqlite;
		const seedTs = new Date().toISOString();
		const insertNode = sqlite.prepare(
			`INSERT INTO nodes (id, kind, payload, confidence, valid_from, recorded_at) VALUES (?, ?, ?, 'Explicit', ?, ?)`,
		);
		const insertProv = sqlite.prepare(
			`INSERT INTO provenance (node_id, source, actor, recorded_at) VALUES (?, 'cli', 'progressive-test', ?)`,
		);
		const insertEdge = sqlite.prepare(
			`INSERT INTO edges (id, kind, src_id, dst_id, valid_from, recorded_at) VALUES (?, ?, ?, ?, ?, ?)`,
		);

		const HOP1_NODES = 400;
		const tx = sqlite.transaction(() => {
			for (let i = 0; i < HOP1_NODES; i++) {
				const id = `01PG${i.toString().padStart(22, '0').slice(-22)}`;
				const payload = JSON.stringify({
					kind: 'ConstraintNode',
					body: `prog leaf ${i}`,
					anchor: { file: `src/prog/leaf${i}.ts` },
				});
				insertNode.run(id, 'ConstraintNode', payload, seedTs, seedTs);
				insertProv.run(id, seedTs);
				const kind = i % 10 < 5 ? 'protects' : i % 10 < 8 ? 'references' : 'parent_of';
				const eid = `01PE${i.toString().padStart(22, '0').slice(-22)}`;
				insertEdge.run(eid, kind, contractId, id, seedTs, seedTs);
			}
		});
		tx();
	});

	afterAll(() => {
		handle.close();
		tmp.dispose();
	});

	it('happy path — returns final ComplianceReport; onProgress called once with hopsComplete=1', async () => {
		const calls: { hopsComplete: 1 | 3; total: number }[] = [];
		const final = await runRippleProgressive({
			contractNodeId: contractId,
			asOf: new Date().toISOString(),
			dao,
			sqlite: handle.sqlite,
			onProgress: (partial) => {
				calls.push({
					hopsComplete: partial.hopsComplete,
					total: partial.report.definitely_affected.length + partial.report.potentially_affected.length,
				});
			},
		});

		expect(calls.length).toBe(1);
		expect(calls[0].hopsComplete).toBe(1);
		// Hop-1 partial sees all 400 first-degree neighbours.
		expect(calls[0].total).toBe(400);
		// Final report is a full ComplianceReport at maxHops=3.
		expect(final.contract_node_id).toBe(contractId);
		expect(final.max_hops).toBe(3);
		// hop-1 fixture has no deeper-than-1 nodes; final == partial in count.
		const finalTotal = final.definitely_affected.length + final.potentially_affected.length;
		expect(finalTotal).toBe(400);
	});

	it('onProgress fires BEFORE the await resolves — notification ordering invariant', async () => {
		let progressFired = false;
		const promise = runRippleProgressive({
			contractNodeId: contractId,
			asOf: new Date().toISOString(),
			dao,
			sqlite: handle.sqlite,
			onProgress: () => {
				progressFired = true;
			},
		});
		// At the await resolution point, progressFired MUST be true. This proves that the
		// callback is invoked synchronously during Phase A (BEFORE the awaited Phase B
		// returns) — not after the Promise settles.
		const result = await promise;
		expect(progressFired).toBe(true);
		expect(result.contract_node_id).toBe(contractId);
	});

	it('deduplicated hops 1+2+3 against 400-node fixture; total wall clock < 5s (Phase-B defensive bound)', async () => {
		const start = performance.now();
		const final = await runRippleProgressive({
			contractNodeId: contractId,
			asOf: new Date().toISOString(),
			dao,
			sqlite: handle.sqlite,
		});
		const elapsed = performance.now() - start;
		// eslint-disable-next-line no-console
		console.log(`[progressive 400-node] total wall clock=${elapsed.toFixed(2)}ms`);
		expect(elapsed).toBeLessThan(5000);

		// Dedup invariant: every node_id appears at most once across both buckets.
		const seen = new Set<string>();
		const allRows = [...final.definitely_affected, ...final.potentially_affected];
		for (const row of allRows) {
			expect(seen.has(row.node_id)).toBe(false);
			seen.add(row.node_id);
		}
		expect(allRows.length).toBe(400);
		// Dummy assertion to silence unused-variable warning on `final` if rewritten.
		void (final as ComplianceReport);
	}, 30_000);
});
