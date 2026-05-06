// Diagnostic: bypass vitest to measure actual seed + per-save latencies on Windows.
// Run: cd kernel && node scripts/bench-diagnostic.mjs
//
// Writes benchmark-results.json on success.

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = mkdtempSync(join(tmpdir(), 'goatide-bench-'));
const dbPath = join(dir, 'graph.db');

console.log('importing dist…');
const { openDatabase, GraphDAO } = await import(pathToFileURL(path.resolve('dist/graph/index.js')).href);
const { ReceiptDAO, buildReceipt } = await import(pathToFileURL(path.resolve('dist/receipt/index.js')).href);
const { classifyTier } = await import(pathToFileURL(path.resolve('dist/canvas/index.js')).href);

const handle = openDatabase(dbPath);
const dao = new GraphDAO(handle.db);
const receiptDao = new ReceiptDAO(handle.db);
const sqlite = handle.sqlite;

// Configurable via env so we can run multiple scales:
//   SEED_NODES=1000 SAMPLE_SAVES=100 node scripts/bench-diagnostic.mjs
//   SEED_NODES=10000 SAMPLE_SAVES=10 node scripts/bench-diagnostic.mjs
const SEED_NODES = Number(process.env.SEED_NODES ?? 10_000);
const EDGES_PER_NODE = Number(process.env.EDGES_PER_NODE ?? 5);
const SAMPLE_SAVES = Number(process.env.SAMPLE_SAVES ?? 100);
const TARGET_P99_MS = 500;
console.log(`config: SEED_NODES=${SEED_NODES} EDGES_PER_NODE=${EDGES_PER_NODE} SAMPLE_SAVES=${SAMPLE_SAVES}`);

console.log(`seeding ${SEED_NODES} nodes (bulk)…`);
const seedNodeStart = Date.now();
const nodeIds = [];
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
			body: `synthetic rule ${i}`,
			anchor: { file: `src/m${i % 100}/f${i}.ts` },
		});
		insertNode.run(id, 'ConstraintNode', payload, seedTs, seedTs);
		insertProv.run(id, seedTs);
	}
});
seedTx();
const seedNodeMs = Date.now() - seedNodeStart;
console.log(`  seed nodes: ${seedNodeMs}ms`);

console.log(`seeding ${SEED_NODES * EDGES_PER_NODE} edges (bulk)…`);
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
console.log(`  seed edges: ${seedEdgeMs}ms`);

// Sanity: confirm read path
const sampleNode = dao.queryById(nodeIds[0]);
if (!sampleNode || sampleNode.kind !== 'ConstraintNode') {
	throw new Error('seed sanity check failed');
}

console.log(`measuring ${SAMPLE_SAVES} saves…`);
const latencies = [];
for (let s = 0; s < SAMPLE_SAVES; s++) {
	const file = `src/m${s % 100}/f${s}.ts`;
	const a = `// before save ${s}`;
	const b = `// before save ${s}\n// after save ${s}`;
	const diff =
		`diff --git a/${file} b/${file}\n` +
		`--- a/${file}\n+++ b/${file}\n` +
		`@@ -1,1 +1,2 @@\n` +
		`-${a}\n` +
		`+${a}\n+// after save ${s}\n`;
	const asOf = new Date().toISOString();
	const start = Date.now();
	const receipt = buildReceipt({ diff, destructive: false, asOf }, dao, receiptDao, handle.sqlite);
	const tier = classifyTier({ receipt, diff, anchorPath: file });
	const elapsed = Date.now() - start;
	latencies.push(elapsed);
	if (s % 10 === 0) {
		console.log(`  save ${s}: ${elapsed}ms (tier=${tier}, citations=${receipt.citations.length})`);
	}
}

latencies.sort((a, b) => a - b);
const p50 = latencies[Math.floor(latencies.length * 0.5)];
const p99 = latencies[Math.floor(latencies.length * 0.99)];
const max = latencies[latencies.length - 1];
const min = latencies[0];
const mean = latencies.reduce((acc, x) => acc + x, 0) / latencies.length;

console.log(`p50=${p50}ms p99=${p99}ms max=${max}ms min=${min}ms mean=${mean.toFixed(1)}ms`);

const results = {
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
const outPath = path.resolve('benchmark-results.json');
writeFileSync(outPath, JSON.stringify(results, null, 2));
console.log(`benchmark-results.json written to ${outPath}`);

handle.close();
rmSync(dir, { recursive: true, force: true });
console.log(p99 < TARGET_P99_MS ? 'TARGET MET' : 'TARGET MISSED');
