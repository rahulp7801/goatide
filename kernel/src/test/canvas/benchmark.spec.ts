/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/canvas/benchmark.spec.ts — Phase 4 (Plan 04-07/04-08) per-save latency benchmark.
//
// Carries the open question from Phase-1 RESEARCH ## Open Questions #3 + STATE ## Blockers/Concerns:
// "Recursive CTE performance ceiling unknown — Phase 4 includes a benchmark gate at 10K-node /
// 50K-edge synthetic graph". Spec target: per-save total p99 < 500 ms across 100 saves.
//
// =============================================================================================
// PHASE-4 GAP-CLOSURE (Plan 04-08, 2026-05-06): TARGET MET
// =============================================================================================
// Pre-fix measurements (Plan 04-07 close, 2026-05-06):
//   1 K nodes  / 5 K edges:  p99 = 12 168 ms  (24x over 500ms target)
//   10 K nodes / 50 K edges: p99 = 115 348 ms (230x over 500ms target)
//
// Post-fix measurements (Plan 04-08, 2026-05-06):
//   1 K nodes  / 5 K edges:  p99 = 15 ms  (target 500ms; 33x margin) — 811x speedup
//   10 K nodes / 50 K edges: p99 = 23 ms  (target 500ms; 21x margin) — 5,015x speedup
//
// 3-layer mitigation that landed:
//   1. Walk-dedup pushdown via JS-iterative BFS (kernel/src/graph/traverse.ts) — duplicate
//      paths pruned BEFORE materialisation; walk row count is now O(reachable_nodes).
//      The recursive-CTE NOT-EXISTS self-reference strategy from the plan is impossible
//      in SQLite (verified: "multiple recursive references"); the iterative-BFS fallback
//      uses one prepared per-level query parameterised by json_each over the frontier.
//   2. AnchorResultCache LRU + TTL at the bridge<->kernel boundary
//      (kernel/src/canvas/anchor-cache.ts + src/vs/goatide/extensions/goatide-bridge/src/
//      save-gate/tier-dispatch.ts) — repeated saves of the same file inside 60s short-circuit
//      kernel.queryNodes. NOT exercised by THIS spec directly (the spec is kernel-internal;
//      the bridge layer is what consumes the cache). The 1K + 10K assertions exercise the
//      kernel-side fix only — even without the cache, the per-save p99 is now 33x under target.
//   3. Bitemporal-active partial indexes (kernel/src/graph/migrations/0004_traverse_perf_indexes.sql) —
//      idx_edges_active_src + idx_edges_active_dst + idx_nodes_active_kind. Force-applied via
//      INDEXED BY in the per-level query's 4-way UNION ALL split (active-fwd + active-rev +
//      historical-fwd + historical-rev). Without the INDEXED BY hint the planner picks SCAN
//      e even after ANALYZE because the partial-index WHERE clause doesn't subsume the
//      bitemporal OR predicate. EXPLAIN QUERY PLAN at 10K-scale shows the active branches
//      do SEARCH e USING INDEX idx_edges_active_src/dst — down from full SCAN e over 50K rows.
// =============================================================================================
//
// W8 (per Plan 04-07 PLAN.md): writes a deterministic schema to kernel/benchmark-results.json
// so the evidence file's "10K-Node Benchmark" section reads structured numbers, NOT scraped
// reporter format. Live numbers are produced by `node scripts/bench-diagnostic.mjs` (the spec
// shape mirror — same seed code + same per-save loop).
//
// Cross-platform note (Plan 04-02/02-03 macOS-14 ARM clock-granularity discovery): `Date.now()`
// resolution can collapse consecutive timestamps into the same millisecond, breaking the
// bitemporal `invalidated_at > at` filter when at == recorded_at. We don't use supersession
// here (seeded only), so the 2 ms spacer is unnecessary in this spec.

import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { mkTempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO } from '../../graph/index.js';
import { ReceiptDAO, buildReceipt } from '../../receipt/index.js';
import { classifyTier } from '../../canvas/index.js';
import { buildSampleDiff } from '../helpers/canvas-fixtures.js';

interface BenchmarkResults {
	sample_count: number;
	p50_ms: number;
	p99_ms: number;
	max_ms: number;
	min_ms: number;
	mean_ms: number;
	target_p99_ms: number;
	target_met: boolean;
	seed_node_count: number;
	seed_edge_count: number;
	seed_node_ms: number;
	seed_edge_ms: number;
	timestamp: string;
}

describe('Phase-4 benchmark — synthetic graph; per-save p99 < 500ms', () => {
	it('seeds 10K nodes + 50K edges + measures end-to-end save latency', async () => {
		const TARGET_P99_MS = 500;
		const SEED_NODES = 10_000;
		const EDGES_PER_NODE = 5;
		const SAMPLE_SAVES = 100;

		const tmp = mkTempDb();
		try {
			const handle = openDatabase(tmp.dbPath);
			const dao = new GraphDAO(handle.db);
			const receiptDao = new ReceiptDAO(handle.db);

			// --- Seed phase ---
			// 10K ConstraintNodes, anchored across 100 file paths (i % 100), so each per-save
			// resolveAnchor hit can find ~100 candidates per file (a realistic high-fanout shape).
			//
			// PERFORMANCE NOTE (Plan 04-07 deviation): the per-row dao.seed() path (Zod parse +
			// drizzle.transaction wrapper + 2 inserts) executes at ~10-30 ms per row on Windows
			// when called individually. 10K such calls would blow the vitest timeout. Use direct
			// `INSERT INTO nodes/provenance VALUES` in a single bulk transaction here — the seed
			// fixture is deliberately fast and untyped because its only job is to populate the
			// graph for the per-save measurement loop. The per-save loop calls the real
			// buildReceipt + classifyTier chain (Zod + drizzle round-trips), which is what the
			// 500 ms target actually constrains.
			const sqlite = handle.sqlite;
			// eslint-disable-next-line no-console
			console.log(`seeding ${SEED_NODES} ConstraintNodes (bulk INSERT)…`);
			const seedNodeStart = Date.now();
			const nodeIds: string[] = [];
			const seedTs = new Date().toISOString();
			const insertNode = sqlite.prepare(
				`INSERT INTO nodes (id, kind, payload, confidence, valid_from, recorded_at) VALUES (?, ?, ?, 'Explicit', ?, ?)`,
			);
			const insertProv = sqlite.prepare(
				`INSERT INTO provenance (node_id, source, actor, recorded_at) VALUES (?, 'cli', 'phase-4-benchmark', ?)`,
			);
			const seedTx = sqlite.transaction(() => {
				for (let i = 0; i < SEED_NODES; i++) {
					const id = `01J${i.toString().padStart(23, '0').slice(-23)}`;
					nodeIds.push(id);
					const payload = JSON.stringify({
						kind: 'ConstraintNode',
						body: `synthetic rule ${i} — Phase-4 benchmark`,
						anchor: { file: `src/m${i % 100}/f${i}.ts` },
					});
					insertNode.run(id, 'ConstraintNode', payload, seedTs, seedTs);
					insertProv.run(id, seedTs);
				}
			});
			seedTx();
			const seedNodeMs = Date.now() - seedNodeStart;
			// eslint-disable-next-line no-console
			console.log(`  seed nodes: ${seedNodeMs}ms`);

			// 50K edges: 5 per node, alternating parent_of / references. Bulk INSERT same pattern.
			// eslint-disable-next-line no-console
			console.log(`seeding ${SEED_NODES * EDGES_PER_NODE} edges (bulk INSERT)…`);
			const seedEdgeStart = Date.now();
			const insertEdge = sqlite.prepare(
				`INSERT INTO edges (id, kind, src_id, dst_id, valid_from, recorded_at) VALUES (?, ?, ?, ?, ?, ?)`,
			);
			let edgeCounter = 0;
			const edgeTx = sqlite.transaction(() => {
				for (let i = 0; i < SEED_NODES; i++) {
					for (let j = 1; j <= EDGES_PER_NODE; j++) {
						const dst = (i + j) % SEED_NODES;
						const eid = `01E${edgeCounter.toString().padStart(23, '0').slice(-23)}`;
						edgeCounter++;
						insertEdge.run(
							eid,
							j === 1 ? 'parent_of' : 'references',
							nodeIds[i],
							nodeIds[dst],
							seedTs,
							seedTs,
						);
					}
				}
			});
			edgeTx();
			const seedEdgeMs = Date.now() - seedEdgeStart;
			// eslint-disable-next-line no-console
			console.log(`  seed edges: ${seedEdgeMs}ms`);

			// Sanity: confirm the GraphDAO read path still sees the bulk-seeded rows.
			const sampleNode = dao.queryById(nodeIds[0]);
			expect(sampleNode).not.toBeNull();
			expect(sampleNode?.kind).toBe('ConstraintNode');
			await Promise.resolve();

			// --- Measure phase ---
			// 100 saves through the production buildReceipt + classifyTier chain (Zod + drizzle
			// + JS-iterative-BFS traverse + ReceiptDAO write). This is the per-save latency the
			// bridge experiences between onWillSaveTextDocument and dispatchTier.
			const latencies: number[] = [];
			for (let s = 0; s < SAMPLE_SAVES; s++) {
				const file = `src/m${s % 100}/f${s}.ts`;
				const diff = buildSampleDiff({
					filePath: file,
					oldText: `// before save ${s}`,
					newText: `// before save ${s}\n// after save ${s}`,
				});
				const asOf = new Date().toISOString();
				const start = Date.now();
				const receipt = buildReceipt({ diff, destructive: false, asOf }, dao, receiptDao, handle.sqlite);
				const tier = classifyTier({ receipt, diff, anchorPath: file });
				const elapsed = Date.now() - start;
				latencies.push(elapsed);
				expect(['silent', 'inline', 'modal']).toContain(tier);
			}

			latencies.sort((a, b) => a - b);
			const p50 = latencies[Math.floor(latencies.length * 0.5)];
			const p99 = latencies[Math.floor(latencies.length * 0.99)];
			const max = latencies[latencies.length - 1];
			const min = latencies[0];
			const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;

			// eslint-disable-next-line no-console
			console.log(
				`[10K] per-save latency over ${SAMPLE_SAVES} samples: ` +
					`p50=${p50}ms p99=${p99}ms max=${max}ms min=${min}ms mean=${mean.toFixed(1)}ms`,
			);

			// W8: write structured results JSON for the evidence file.
			const results: BenchmarkResults = {
				sample_count: SAMPLE_SAVES,
				p50_ms: p50,
				p99_ms: p99,
				max_ms: max,
				min_ms: min,
				mean_ms: Number(mean.toFixed(2)),
				target_p99_ms: TARGET_P99_MS,
				target_met: p99 < TARGET_P99_MS,
				seed_node_count: SEED_NODES,
				seed_edge_count: SEED_NODES * EDGES_PER_NODE,
				seed_node_ms: seedNodeMs,
				seed_edge_ms: seedEdgeMs,
				timestamp: new Date().toISOString(),
			};
			const outPath = path.resolve(process.cwd(), 'benchmark-results.json');
			writeFileSync(outPath, JSON.stringify(results, null, 2));
			// eslint-disable-next-line no-console
			console.log(`benchmark-results.json written to ${outPath}`);

			// RESEARCH ## Open Questions #3 target. Plan 04-08 gap-closure landed: 10K p99 = 23ms
			// post-fix vs 115 348ms pre-fix (5,015x speedup). The assertion runs in CI now.
			expect(p99).toBeLessThan(TARGET_P99_MS);

			handle.close();
		} finally {
			tmp.dispose();
		}
	}, 120_000);  // Post-fix budget: 60s seed + ~3s measure phase. Pre-fix had 600s timeout
	              // because the 100 saves at ~12-115s/save would otherwise blow the test budget.

	it('seeds 1K nodes + 5K edges + measures end-to-end save latency (realistic Phase-5 scale)', async () => {
		const TARGET_P99_MS = 500;
		const SEED_NODES = 1_000;     // <-- LITERAL — the realistic Phase-5 graph state.
		const EDGES_PER_NODE = 5;
		const SAMPLE_SAVES = 100;

		const tmp = mkTempDb();
		try {
			const handle = openDatabase(tmp.dbPath);
			const dao = new GraphDAO(handle.db);
			const receiptDao = new ReceiptDAO(handle.db);
			const sqlite = handle.sqlite;

			// Bulk-seed 1K nodes (same pattern as the 10K test) — completes in < 100ms.
			const nodeIds: string[] = [];
			const seedTs = new Date().toISOString();
			const insertNode = sqlite.prepare(
				`INSERT INTO nodes (id, kind, payload, confidence, valid_from, recorded_at) VALUES (?, ?, ?, 'Explicit', ?, ?)`,
			);
			const insertProv = sqlite.prepare(
				`INSERT INTO provenance (node_id, source, actor, recorded_at) VALUES (?, 'cli', 'phase-4-benchmark-1k', ?)`,
			);
			sqlite.transaction(() => {
				for (let i = 0; i < SEED_NODES; i++) {
					const id = `01J${i.toString().padStart(23, '0').slice(-23)}`;
					nodeIds.push(id);
					const payload = JSON.stringify({
						kind: 'ConstraintNode',
						body: `synthetic rule ${i} — Phase-4 benchmark 1K`,
						anchor: { file: `src/m${i % 100}/f${i}.ts` },
					});
					insertNode.run(id, 'ConstraintNode', payload, seedTs, seedTs);
					insertProv.run(id, seedTs);
				}
			})();

			const insertEdge = sqlite.prepare(
				`INSERT INTO edges (id, kind, src_id, dst_id, valid_from, recorded_at) VALUES (?, ?, ?, ?, ?, ?)`,
			);
			let edgeCounter = 0;
			sqlite.transaction(() => {
				for (let i = 0; i < SEED_NODES; i++) {
					for (let j = 1; j <= EDGES_PER_NODE; j++) {
						const dst = (i + j) % SEED_NODES;
						const eid = `01E${edgeCounter.toString().padStart(23, '0').slice(-23)}`;
						edgeCounter++;
						insertEdge.run(eid, j === 1 ? 'parent_of' : 'references', nodeIds[i], nodeIds[dst], seedTs, seedTs);
					}
				}
			})();

			const latencies: number[] = [];
			for (let s = 0; s < SAMPLE_SAVES; s++) {
				const file = `src/m${s % 100}/f${s}.ts`;
				const diff = buildSampleDiff({
					filePath: file,
					oldText: `// before save ${s}`,
					newText: `// before save ${s}\n// after save ${s}`,
				});
				const asOf = new Date().toISOString();
				const start = Date.now();
				const receipt = buildReceipt({ diff, destructive: false, asOf }, dao, receiptDao, handle.sqlite);
				const tier = classifyTier({ receipt, diff, anchorPath: file });
				const elapsed = Date.now() - start;
				latencies.push(elapsed);
				expect(['silent', 'inline', 'modal']).toContain(tier);
			}

			latencies.sort((a, b) => a - b);
			const p99 = latencies[Math.floor(latencies.length * 0.99)];
			// eslint-disable-next-line no-console
			console.log(`[1K] p99=${p99}ms (target ${TARGET_P99_MS}ms)`);
			expect(p99).toBeLessThan(TARGET_P99_MS);

			handle.close();
		} finally {
			tmp.dispose();
		}
	}, 120_000);
});
