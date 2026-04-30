/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Plan 03-03 Task 2: REC-01 (shape), REC-02 (citation tuple), REC-04 (destructive guard
// incl. Pitfall 6 vacuous-truth empty-citation case + mixed Explicit+Inferred passes),
// REC-05 (cite_eligible filter on Inferred).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO, type OpenDatabaseHandle } from '../../graph/index.js';
import { buildReceipt, ReceiptDAO, ReceiptRefusalError } from '../../receipt/index.js';

const SAMPLE_DIFF = `diff --git a/src/auth.ts b/src/auth.ts
index 1234..5678 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,3 +1,4 @@
 export function login() {
+	// new line
 	return null;
 }
`;

describe('Phase 3 — receipt builder', () => {
	let tmp: TempDb;
	let handle: OpenDatabaseHandle;
	let dao: GraphDAO;
	let receiptDao: ReceiptDAO;
	const now = () => new Date().toISOString();

	beforeEach(() => {
		tmp = mkTempDb();
		handle = openDatabase(tmp.dbPath);
		dao = new GraphDAO(handle.db);
		receiptDao = new ReceiptDAO(handle.db);
	});

	afterEach(() => {
		handle.close();
		tmp.dispose();
	});

	describe('REC-01 — shape', () => {
		it('receipt carries all six fields and persists to receipts table', () => {
			dao.seed({
				payload: { kind: 'ConstraintNode', body: 'auth body', anchor: { file: 'src/auth.ts' } },
				provenance: { source: 'cli', actor: 'test' },
			});
			const r = buildReceipt({ diff: SAMPLE_DIFF, destructive: false, asOf: now() }, dao, receiptDao, handle.sqlite);
			const persisted = receiptDao.read(r.id);
			expect({
				keys: Object.keys(r).sort(),
				idIs26: r.id.length === 26,
				changeIdIs26: r.change_id.length === 26,
				snapshotPresent: r.graph_snapshot_tx_time.length > 0,
				persistedRecovered: persisted?.id === r.id,
				persistedDestructive: persisted?.destructive,
			}).toEqual({
				keys: ['change_id', 'citations', 'destructive', 'drill_chain', 'graph_snapshot_tx_time', 'id'],
				idIs26: true,
				changeIdIs26: true,
				snapshotPresent: true,
				persistedRecovered: true,
				persistedDestructive: false,
			});
		});
	});

	describe('REC-02 — citation tuple shape', () => {
		it('each citation has (node_id, version, confidence, edge_path, snippet); snippet <=280', () => {
			const longBody = 'x'.repeat(500);
			dao.seed({
				payload: { kind: 'ConstraintNode', body: longBody, anchor: { file: 'src/auth.ts' } },
				provenance: { source: 'cli', actor: 'test' },
			});
			const r = buildReceipt({ diff: SAMPLE_DIFF, destructive: false, asOf: now() }, dao, receiptDao, handle.sqlite);
			expect({
				count: r.citations.length,
				keys: r.citations[0] ? Object.keys(r.citations[0]).sort() : [],
				snippetLen: r.citations[0]?.snippet.length,
				versionEqualsNodeId: r.citations[0]?.version === r.citations[0]?.node_id,
				confidenceIsExplicit: r.citations[0]?.confidence === 'Explicit',
			}).toEqual({
				count: 1,
				keys: ['confidence', 'edge_path', 'node_id', 'snippet', 'version'],
				snippetLen: 280,
				versionEqualsNodeId: true,
				confidenceIsExplicit: true,
			});
		});

		it('empty seed (no anchored node) -> empty citations, but receipt still composed (REC-01)', () => {
			const r = buildReceipt({ diff: SAMPLE_DIFF, destructive: false, asOf: now() }, dao, receiptDao, handle.sqlite);
			expect({ citations: r.citations, hasId: !!r.id }).toEqual({ citations: [], hasId: true });
		});
	});

	describe('REC-04 — destructive guard', () => {
		it('destructive + all-Inferred citations throws ReceiptRefusalError', () => {
			// Manually mark node Inferred via raw SQL (Phase-2 DAO writes Explicit only).
			const { id } = dao.seed({
				payload: { kind: 'ConstraintNode', body: 'inferred body', anchor: { file: 'src/auth.ts' } },
				provenance: { source: 'cli', actor: 'test' },
			});
			handle.sqlite.prepare(`UPDATE nodes SET confidence = 'Inferred' WHERE id = ?`).run(id);
			expect(() =>
				buildReceipt({ diff: SAMPLE_DIFF, destructive: true, asOf: now() }, dao, receiptDao, handle.sqlite)
			).toThrow(ReceiptRefusalError);
		});

		it('destructive + EMPTY citations does NOT throw (Pitfall 6 — vacuous truth guard)', () => {
			// No node anchored to src/auth.ts; citations will be [].
			const r = buildReceipt({ diff: SAMPLE_DIFF, destructive: true, asOf: now() }, dao, receiptDao, handle.sqlite);
			expect({ citations: r.citations.length, destructive: r.destructive }).toEqual({ citations: 0, destructive: true });
		});

		it('destructive + mixed Explicit + Inferred passes', () => {
			const { id: inferredId } = dao.seed({
				payload: { kind: 'ConstraintNode', body: 'inferred', anchor: { file: 'src/auth.ts' } },
				provenance: { source: 'cli', actor: 'test' },
			});
			handle.sqlite.prepare(`UPDATE nodes SET confidence = 'Inferred' WHERE id = ?`).run(inferredId);
			dao.seed({
				payload: { kind: 'ConstraintNode', body: 'explicit', anchor: { file: 'src/auth.ts' } },
				provenance: { source: 'cli', actor: 'test' },
			});
			const r = buildReceipt({ diff: SAMPLE_DIFF, destructive: true, asOf: now() }, dao, receiptDao, handle.sqlite);
			const confidences = r.citations.map((c) => c.confidence).sort();
			expect(confidences).toEqual(['Explicit', 'Inferred']);
		});
	});

	describe('REC-05 — cite_eligible filter', () => {
		it('Inferred node with cite_eligible=false is excluded; Explicit unaffected', () => {
			// Two nodes anchored to same file: one Inferred + cite_eligible=false (excluded),
			// one Explicit (included). Phase-3 NodePayloadSchema.parse strips unknown keys, so
			// we seed with a base payload then patch cite_eligible=false directly into the
			// JSON column via raw SQL (simulating a Phase-4 promotion mechanism that DOES
			// know about the flag). This is the documented test-only escape hatch.
			const { id: hidden } = dao.seed({
				payload: { kind: 'ConstraintNode', body: 'hidden', anchor: { file: 'src/auth.ts' } },
				provenance: { source: 'cli', actor: 'test' },
			});
			handle.sqlite.prepare(
				`UPDATE nodes SET confidence = 'Inferred', payload = json_set(payload, '$.cite_eligible', json('false')) WHERE id = ?`
			).run(hidden);
			const { id: shown } = dao.seed({
				payload: { kind: 'ConstraintNode', body: 'shown', anchor: { file: 'src/auth.ts' } },
				provenance: { source: 'cli', actor: 'test' },
			});
			const r = buildReceipt({ diff: SAMPLE_DIFF, destructive: false, asOf: now() }, dao, receiptDao, handle.sqlite);
			expect({
				includesShown: r.citations.some((c) => c.node_id === shown),
				includesHidden: r.citations.some((c) => c.node_id === hidden),
			}).toEqual({ includesShown: true, includesHidden: false });
		});
	});
});
