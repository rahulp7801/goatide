/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/drift/ripple-perf.spec.ts — Phase 7 (Plan 07-04) DRIFT-05 SC #5 benchmark.
//
// SC #5 budget: 400-node first-degree report under 1s p99. This file:
//   1) Seeds 1 ContractNode + 400 reachable nodes via mixed protects/references/parent_of edges.
//   2) Measures runRippleAnalysis(maxHops:1) p99 across 100 iterations.
//   3) Asserts p99 < 1000ms.
//
// Pitfall-4 hub-fixture sub-test (capped at maxHops=2 by design):
//   - Combinatorial-explosion stressor: 1 contract → 50 → 50 (2500 reachable).
//   - nodeCap=1000; assert truncated:true + result row count <= 1000 + p99 still < 1s.
//   - 3-hop cap test for the hub fixture is OMITTED here (50→50→50 = 125K theoretical
//     edges would dominate seed time without proving anything new about the cap; the
//     constitutional 3-hop pin is exercised by ripple.spec.ts test 4 with a 4-hop chain).

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO, type OpenDatabaseHandle } from '../../graph/index.js';
import { runRippleAnalysis } from '../../drift/ripple.js';

const SEED_NODES_400 = 400;   // <-- LITERAL — DRIFT-05 SC #5 budget reference fixture.
const SAMPLE_RUNS = 100;
const TARGET_P99_MS = 1000;

const HUB_FANOUT_PER_LEVEL = 50;  // 1 → 50 → 50 = 2500 reachable; nodeCap=1000 truncates.
const HUB_NODE_CAP = 1000;

describe('drift/ripple-perf — Plan 07-04 (DRIFT-05 SC #5)', () => {
	describe('400-node first-degree blast radius — p99 under 1s budget', () => {
		let tmp: TempDb;
		let handle: OpenDatabaseHandle;
		let dao: GraphDAO;
		let contractId: string;

		beforeAll(() => {
			tmp = mkTempDb();
			handle = openDatabase(tmp.dbPath);
			dao = new GraphDAO(handle.db);

			// Seed 1 ContractNode + 400 mixed-edge downstream reachables. Bulk insert via raw
			// SQL for speed (mirrors Phase-4 04-08 benchmark.spec.ts SEED_NODES pattern). The
			// per-row dao.seed() path is too slow at 400 rows for a 60s test budget on Windows.
			const seedRoot = dao.seed({
				payload: {
					kind: 'ContractNode',
					body: 'Phase-7 SC #5 benchmark — root',
					anchor: { file: 'contracts/sc5.md' },
					contract_path: 'contracts/sc5.md',
				},
				provenance: { source: 'cli', actor: 'ripple-perf', detail: { variant: '400-node' } },
			});
			contractId = seedRoot.id;

			const sqlite = handle.sqlite;
			const seedTs = new Date().toISOString();
			const insertNode = sqlite.prepare(
				`INSERT INTO nodes (id, kind, payload, confidence, valid_from, recorded_at) VALUES (?, ?, ?, 'Explicit', ?, ?)`,
			);
			const insertProv = sqlite.prepare(
				`INSERT INTO provenance (node_id, source, actor, recorded_at) VALUES (?, 'cli', 'ripple-perf', ?)`,
			);
			const insertEdge = sqlite.prepare(
				`INSERT INTO edges (id, kind, src_id, dst_id, valid_from, recorded_at) VALUES (?, ?, ?, ?, ?, ?)`,
			);
			const tx = sqlite.transaction(() => {
				for (let i = 0; i < SEED_NODES_400; i++) {
					const id = `01P${i.toString().padStart(23, '0').slice(-23)}`;
					const payload = JSON.stringify({
						kind: 'ConstraintNode',
						body: `sc5 leaf ${i}`,
						anchor: { file: `src/sc5/leaf${i}.ts` },
					});
					insertNode.run(id, 'ConstraintNode', payload, seedTs, seedTs);
					insertProv.run(id, seedTs);
					// Edge kind mix: 50% protects, 30% references, 20% parent_of.
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

		it('p99 < 1000ms on 400-node downstream blast radius (100 runs)', { timeout: 60_000 }, () => {
			// Warm-up: 1 invocation primes the SQLite cache + statement cache.
			runRippleAnalysis({
				contractNodeId: contractId,
				maxHops: 1,
				asOf: new Date().toISOString(),
				dao,
				sqlite: handle.sqlite,
			});

			const latencies: number[] = [];
			for (let i = 0; i < SAMPLE_RUNS; i++) {
				const start = performance.now();
				const report = runRippleAnalysis({
					contractNodeId: contractId,
					maxHops: 1,
					asOf: new Date().toISOString(),
					dao,
					sqlite: handle.sqlite,
				});
				const elapsed = performance.now() - start;
				latencies.push(elapsed);
				// Sanity-check the result shape on the first iteration.
				if (i === 0) {
					const total = report.definitely_affected.length + report.potentially_affected.length;
					// 50% protects + 30% references + 20% parent_of = 80% in def + 20% in pot…
					// wait: 50% protects → definitely; 50% (30+20) references/parent_of → potentially.
					expect(total).toBe(SEED_NODES_400);
					expect(report.truncated).toBe(false);
				}
			}

			latencies.sort((a, b) => a - b);
			const p50 = latencies[Math.floor(latencies.length * 0.5)];
			const p99 = latencies[Math.floor(latencies.length * 0.99)];
			const max = latencies[latencies.length - 1];
			// eslint-disable-next-line no-console
			console.log(
				`[400-node ripple-perf] p50=${p50.toFixed(2)}ms p99=${p99.toFixed(2)}ms max=${max.toFixed(2)}ms target=${TARGET_P99_MS}ms`,
			);

			expect(p99).toBeLessThan(TARGET_P99_MS);
		});
	});

	describe('Pitfall-4 hub-fixture nodeCap defense — combinatorial-explosion stressor', () => {
		let tmp: TempDb;
		let handle: OpenDatabaseHandle;
		let dao: GraphDAO;
		let contractId: string;

		beforeAll(() => {
			tmp = mkTempDb();
			handle = openDatabase(tmp.dbPath);
			dao = new GraphDAO(handle.db);

			// Seed: 1 ContractNode → 50 hub nodes → each hub node → 50 leaves = 2500 leaves total.
			// Edge kind: protects everywhere (worst case for "definitely_affected" classification).
			const seedRoot = dao.seed({
				payload: {
					kind: 'ContractNode',
					body: 'Pitfall-4 hub stressor — root',
					anchor: { file: 'contracts/hub.md' },
					contract_path: 'contracts/hub.md',
				},
				provenance: { source: 'cli', actor: 'ripple-perf', detail: { variant: 'hub' } },
			});
			contractId = seedRoot.id;

			const sqlite = handle.sqlite;
			const seedTs = new Date().toISOString();
			const insertNode = sqlite.prepare(
				`INSERT INTO nodes (id, kind, payload, confidence, valid_from, recorded_at) VALUES (?, ?, ?, 'Explicit', ?, ?)`,
			);
			const insertProv = sqlite.prepare(
				`INSERT INTO provenance (node_id, source, actor, recorded_at) VALUES (?, 'cli', 'ripple-perf', ?)`,
			);
			const insertEdge = sqlite.prepare(
				`INSERT INTO edges (id, kind, src_id, dst_id, valid_from, recorded_at) VALUES (?, 'protects', ?, ?, ?, ?)`,
			);
			let edgeIdx = 0;
			const hubIds: string[] = [];
			const tx = sqlite.transaction(() => {
				for (let h = 0; h < HUB_FANOUT_PER_LEVEL; h++) {
					const hubId = `01HU${h.toString().padStart(22, '0').slice(-22)}`;
					hubIds.push(hubId);
					const payload = JSON.stringify({ kind: 'ConstraintNode', body: `hub-${h}`, anchor: { file: `src/hub/h${h}.ts` } });
					insertNode.run(hubId, 'ConstraintNode', payload, seedTs, seedTs);
					insertProv.run(hubId, seedTs);
					const eid = `01HE${edgeIdx.toString().padStart(22, '0').slice(-22)}`;
					edgeIdx++;
					insertEdge.run(eid, contractId, hubId, seedTs, seedTs);
				}
				for (let h = 0; h < HUB_FANOUT_PER_LEVEL; h++) {
					for (let l = 0; l < HUB_FANOUT_PER_LEVEL; l++) {
						const leafId = `01LF${(h * HUB_FANOUT_PER_LEVEL + l).toString().padStart(22, '0').slice(-22)}`;
						const payload = JSON.stringify({ kind: 'ConstraintNode', body: `leaf-${h}-${l}`, anchor: { file: `src/leaves/${h}-${l}.ts` } });
						insertNode.run(leafId, 'ConstraintNode', payload, seedTs, seedTs);
						insertProv.run(leafId, seedTs);
						const eid = `01HE${edgeIdx.toString().padStart(22, '0').slice(-22)}`;
						edgeIdx++;
						insertEdge.run(eid, hubIds[h], leafId, seedTs, seedTs);
					}
				}
			});
			tx();
		});

		afterAll(() => {
			handle.close();
			tmp.dispose();
		});

		it('truncated=true with nodeCap=1000 + p99 still under 1s on 2500-node hub (maxHops=2)', { timeout: 60_000 }, () => {
			// Warm-up.
			runRippleAnalysis({
				contractNodeId: contractId,
				maxHops: 2,
				asOf: new Date().toISOString(),
				dao,
				sqlite: handle.sqlite,
				nodeCap: HUB_NODE_CAP,
			});

			const latencies: number[] = [];
			let lastReport: ReturnType<typeof runRippleAnalysis> | undefined;
			for (let i = 0; i < SAMPLE_RUNS; i++) {
				const start = performance.now();
				lastReport = runRippleAnalysis({
					contractNodeId: contractId,
					maxHops: 2,
					asOf: new Date().toISOString(),
					dao,
					sqlite: handle.sqlite,
					nodeCap: HUB_NODE_CAP,
				});
				latencies.push(performance.now() - start);
			}

			latencies.sort((a, b) => a - b);
			const p50 = latencies[Math.floor(latencies.length * 0.5)];
			const p99 = latencies[Math.floor(latencies.length * 0.99)];
			// eslint-disable-next-line no-console
			console.log(
				`[hub-fixture ripple-perf] p50=${p50.toFixed(2)}ms p99=${p99.toFixed(2)}ms target=${TARGET_P99_MS}ms`,
			);

			expect(lastReport?.truncated).toBe(true);
			const total = (lastReport?.definitely_affected.length ?? 0) + (lastReport?.potentially_affected.length ?? 0);
			expect(total).toBe(HUB_NODE_CAP);
			expect(p99).toBeLessThan(TARGET_P99_MS);
		});
	});
});
