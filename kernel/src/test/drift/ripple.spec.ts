/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/drift/ripple.spec.ts — Phase 7 (Plan 07-04) DRIFT-04 + DRIFT-05 RED.
//
// Tri-bucket ripple analysis (kernel/src/drift/ripple.ts): walks active edges from a
// ContractNode + classifies reachable nodes per FIRST edge kind in edge_path:
//   - protects → definitely_affected
//   - references / parent_of → potentially_affected
//   - derived_from → omitted entirely (audit-trail edge, not impact)
// 3-hop cap pinned via TypeScript literal-union type AND refuse-unbounded-ripple-walk.sh.
// Pitfall-4 hub-node node_cap defense default 1000 (env override GOATIDE_DRIFT_NODE_CAP).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { makeDriftHarness, type DriftHarness } from './_setup.js';
import { runRippleAnalysis } from '../../drift/ripple.js';

/** Seed a minimal ContractNode + a single downstream Constraint connected by `kind`. */
function seedContractWithDownstream(harness: DriftHarness, kind: 'protects' | 'references' | 'parent_of' | 'derived_from'): { contractId: string; downstreamId: string } {
	const ts = new Date().toISOString();
	const contract = harness.dao.seed({
		payload: {
			kind: 'ContractNode',
			body: 'Phase-7 ripple test — root contract',
			anchor: { file: 'contracts/ripple-root.md' },
			contract_path: 'contracts/ripple-root.md',
		},
		provenance: { source: 'cli', actor: 'ripple-test', detail: { ts } },
	});
	const downstream = harness.dao.seed({
		payload: {
			kind: 'ConstraintNode',
			body: `downstream node reached via ${kind}`,
			anchor: { file: `src/feature/x.ts` },
		},
		provenance: { source: 'cli', actor: 'ripple-test', detail: { ts } },
	});
	harness.dao.writeEdge({ kind, src_id: contract.id, dst_id: downstream.id });
	return { contractId: contract.id, downstreamId: downstream.id };
}

describe('drift/ripple — Plan 07-04 (DRIFT-04 + DRIFT-05)', () => {
	let harness: DriftHarness;
	beforeEach(() => {
		harness = makeDriftHarness();
	});
	afterEach(() => {
		harness.cleanup();
	});

	it('tri-bucket classification routes protects → definitely_affected', () => {
		const { contractId, downstreamId } = seedContractWithDownstream(harness, 'protects');
		const asOf = new Date().toISOString();
		const report = runRippleAnalysis({
			contractNodeId: contractId,
			maxHops: 1,
			asOf,
			dao: harness.dao,
			sqlite: harness.dbHandle.sqlite,
		});
		expect(report.contract_node_id).toBe(contractId);
		expect(report.max_hops).toBe(1);
		expect(report.truncated).toBe(false);
		expect(report.definitely_affected.length).toBe(1);
		expect(report.definitely_affected[0].node_id).toBe(downstreamId);
		expect(report.definitely_affected[0].hops).toBe(1);
		expect(report.potentially_affected.length).toBe(0);
	});

	it('routes references/parent_of → potentially_affected', () => {
		const refOut = seedContractWithDownstream(harness, 'references');
		const asOf = new Date().toISOString();
		const refReport = runRippleAnalysis({
			contractNodeId: refOut.contractId,
			maxHops: 1,
			asOf,
			dao: harness.dao,
			sqlite: harness.dbHandle.sqlite,
		});
		expect(refReport.potentially_affected.length).toBe(1);
		expect(refReport.potentially_affected[0].node_id).toBe(refOut.downstreamId);
		expect(refReport.definitely_affected.length).toBe(0);

		// Fresh harness scope — new harness for parent_of variant via inline seed.
		const harness2 = makeDriftHarness();
		try {
			const parentOut = seedContractWithDownstream(harness2, 'parent_of');
			const parentAsOf = new Date().toISOString(); // captured AFTER seed so valid_from <= asOf
			const parentReport = runRippleAnalysis({
				contractNodeId: parentOut.contractId,
				maxHops: 1,
				asOf: parentAsOf,
				dao: harness2.dao,
				sqlite: harness2.dbHandle.sqlite,
			});
			expect(parentReport.potentially_affected.length).toBe(1);
			expect(parentReport.potentially_affected[0].node_id).toBe(parentOut.downstreamId);
			expect(parentReport.definitely_affected.length).toBe(0);
		} finally {
			harness2.cleanup();
		}
	});

	it('routes derived_from → omitted from report (not in either bucket)', () => {
		const { contractId } = seedContractWithDownstream(harness, 'derived_from');
		const asOf = new Date().toISOString();
		const report = runRippleAnalysis({
			contractNodeId: contractId,
			maxHops: 1,
			asOf,
			dao: harness.dao,
			sqlite: harness.dbHandle.sqlite,
		});
		// derived_from is NOT in the 'all' scope walked by traverse (only parent_of/references/derived_from
		// are walked, but derived_from edges produce edge_path entries that classify into 'omitted').
		expect(report.definitely_affected.length).toBe(0);
		expect(report.potentially_affected.length).toBe(0);
	});

	it('3-hop cap enforced — never returns nodes at depth > 3', () => {
		// 4-hop chain: contract --protects--> n1 --protects--> n2 --protects--> n3 --protects--> n4
		const ts = new Date().toISOString();
		const contract = harness.dao.seed({
			payload: { kind: 'ContractNode', body: 'root', anchor: { file: 'contracts/c.md' }, contract_path: 'contracts/c.md' },
			provenance: { source: 'cli', actor: 'ripple-test', detail: { ts } },
		});
		const ids: string[] = [];
		for (let i = 1; i <= 4; i++) {
			const n = harness.dao.seed({
				payload: { kind: 'ConstraintNode', body: `n${i}`, anchor: { file: `src/n${i}.ts` } },
				provenance: { source: 'cli', actor: 'ripple-test', detail: { ts } },
			});
			ids.push(n.id);
		}
		// Build 4-hop chain.
		harness.dao.writeEdge({ kind: 'protects', src_id: contract.id, dst_id: ids[0] });
		harness.dao.writeEdge({ kind: 'protects', src_id: ids[0], dst_id: ids[1] });
		harness.dao.writeEdge({ kind: 'protects', src_id: ids[1], dst_id: ids[2] });
		harness.dao.writeEdge({ kind: 'protects', src_id: ids[2], dst_id: ids[3] });

		const report = runRippleAnalysis({
			contractNodeId: contract.id,
			maxHops: 3,
			asOf: new Date().toISOString(),
			dao: harness.dao,
			sqlite: harness.dbHandle.sqlite,
		});
		// Reachable at hops 1, 2, 3 only; n4 (at hops=4) MUST be omitted.
		const allReachedIds = [
			...report.definitely_affected.map((r) => r.node_id),
			...report.potentially_affected.map((r) => r.node_id),
		];
		expect(allReachedIds).toContain(ids[0]); // hops 1
		expect(allReachedIds).toContain(ids[1]); // hops 2
		expect(allReachedIds).toContain(ids[2]); // hops 3
		expect(allReachedIds).not.toContain(ids[3]); // hops 4 — capped
		// All returned rows MUST have hops ∈ {1,2,3}.
		for (const row of [...report.definitely_affected, ...report.potentially_affected]) {
			expect(row.hops).toBeGreaterThanOrEqual(1);
			expect(row.hops).toBeLessThanOrEqual(3);
		}
	});

	it('first edge kind in edge_path drives bucket — protects→references chain stays definitely_affected', () => {
		// contract --protects--> mid --references--> leaf
		// leaf is reached via edge_path '/protects:.../references:...' — FIRST kind = protects.
		// Therefore leaf classifies as definitely_affected at hops=2.
		const ts = new Date().toISOString();
		const contract = harness.dao.seed({
			payload: { kind: 'ContractNode', body: 'root', anchor: { file: 'contracts/c.md' }, contract_path: 'contracts/c.md' },
			provenance: { source: 'cli', actor: 'ripple-test', detail: { ts } },
		});
		const mid = harness.dao.seed({
			payload: { kind: 'ConstraintNode', body: 'mid', anchor: { file: 'src/mid.ts' } },
			provenance: { source: 'cli', actor: 'ripple-test', detail: { ts } },
		});
		const leaf = harness.dao.seed({
			payload: { kind: 'ConstraintNode', body: 'leaf', anchor: { file: 'src/leaf.ts' } },
			provenance: { source: 'cli', actor: 'ripple-test', detail: { ts } },
		});
		harness.dao.writeEdge({ kind: 'protects', src_id: contract.id, dst_id: mid.id });
		harness.dao.writeEdge({ kind: 'references', src_id: mid.id, dst_id: leaf.id });

		const report = runRippleAnalysis({
			contractNodeId: contract.id,
			maxHops: 2,
			asOf: new Date().toISOString(),
			dao: harness.dao,
			sqlite: harness.dbHandle.sqlite,
		});
		const definitelyIds = report.definitely_affected.map((r) => r.node_id);
		expect(definitelyIds).toContain(mid.id);
		expect(definitelyIds).toContain(leaf.id);
		// leaf reached at hops=2 BUT classified by FIRST edge kind ('protects').
		const leafRow = report.definitely_affected.find((r) => r.node_id === leaf.id);
		expect(leafRow?.hops).toBe(2);
	});

	it('Pitfall-4 nodeCap defense — hub-fixture truncates with truncated=true', () => {
		// Seed 1500 downstream nodes connected via protects to one root contract; nodeCap=500.
		// Expect 500 rows + truncated:true.
		const ts = new Date().toISOString();
		const contract = harness.dao.seed({
			payload: { kind: 'ContractNode', body: 'hub root', anchor: { file: 'contracts/hub.md' }, contract_path: 'contracts/hub.md' },
			provenance: { source: 'cli', actor: 'ripple-test', detail: { ts } },
		});
		// Bulk-seed via raw SQL for speed (mirrors Phase-4 benchmark.spec.ts pattern).
		const HUB_NODES = 1500;
		const sqlite = harness.dbHandle.sqlite;
		const seedTs = new Date().toISOString();
		const insertNode = sqlite.prepare(
			`INSERT INTO nodes (id, kind, payload, confidence, valid_from, recorded_at) VALUES (?, ?, ?, 'Explicit', ?, ?)`,
		);
		const insertProv = sqlite.prepare(
			`INSERT INTO provenance (node_id, source, actor, recorded_at) VALUES (?, 'cli', 'ripple-hub-test', ?)`,
		);
		const insertEdge = sqlite.prepare(
			`INSERT INTO edges (id, kind, src_id, dst_id, valid_from, recorded_at) VALUES (?, 'protects', ?, ?, ?, ?)`,
		);
		const ids: string[] = [];
		const tx = sqlite.transaction(() => {
			for (let i = 0; i < HUB_NODES; i++) {
				const id = `01H${i.toString().padStart(23, '0').slice(-23)}`;
				ids.push(id);
				const payload = JSON.stringify({
					kind: 'ConstraintNode',
					body: `hub-leaf ${i}`,
					anchor: { file: `src/hub/leaf${i}.ts` },
				});
				insertNode.run(id, 'ConstraintNode', payload, seedTs, seedTs);
				insertProv.run(id, seedTs);
				insertEdge.run(`01HE${i.toString().padStart(22, '0').slice(-22)}`, contract.id, id, seedTs, seedTs);
			}
		});
		tx();

		const report = runRippleAnalysis({
			contractNodeId: contract.id,
			maxHops: 1,
			asOf: new Date().toISOString(),
			dao: harness.dao,
			sqlite: harness.dbHandle.sqlite,
			nodeCap: 500,
		});
		expect(report.truncated).toBe(true);
		const total = report.definitely_affected.length + report.potentially_affected.length;
		expect(total).toBe(500);
	});
});
