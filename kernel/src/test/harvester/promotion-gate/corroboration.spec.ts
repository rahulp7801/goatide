/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/promotion-gate/corroboration.spec.ts — Phase 5 Plan 05-06 PORT-05(b).
//
// When 3 distinct provenance.source values land on the same Inferred node's anchor tuple,
// the corroboration counter flips cite_eligible via dao.supersede. Pitfall 9: concurrent
// observations against the same nodeId serialize through a per-node async queue so the
// final corroborations array reflects all calls (no lost updates).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkTempDb, type TempDb } from '../../helpers/temp-db.js';
import { openDatabase, GraphDAO } from '../../../graph/index.js';
import { incrementCorroborationAndMaybePromote } from '../../../harvester/promotion-gate/corroboration-counter.js';

describe('PORT-05 (b): Corroboration (N=3 distinct sources) flips cite_eligible', () => {
	let tmp: TempDb;
	beforeEach(() => { tmp = mkTempDb(); });
	afterEach(() => { tmp.dispose(); });

	it('3 distinct provenance.source values for same anchor tuple flip cite_eligible (default N=3)', async () => {
		const { db, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			const { id } = dao.seed({
				payload: { kind: 'ConstraintNode', body: 'corroboration target', anchor: { file: 'src/x.ts' } },
				provenance: { source: 'harvester:promoter', actor: 'promoter' },
				confidence: 'Inferred',
			});

			await incrementCorroborationAndMaybePromote({ dao, nodeId: id, observationProvenanceSource: 'harvester:claude_jsonl' });
			await incrementCorroborationAndMaybePromote({ dao, nodeId: id, observationProvenanceSource: 'harvester:editor_save' });
			await incrementCorroborationAndMaybePromote({ dao, nodeId: id, observationProvenanceSource: 'harvester:git_commit' });

			// After 3 distinct sources, the latest active row has cite_eligible=true.
			let cursor = id;
			let next = dao.findSuccessor(cursor);
			while (next) {
				cursor = next.id;
				next = dao.findSuccessor(cursor);
			}
			const head = dao.queryById(cursor);
			const headPayload = head?.payload as { cite_eligible?: boolean; detail?: { corroborations?: string[] } } | undefined;

			expect({
				headExists: !!head,
				ciEligible: headPayload?.cite_eligible,
				corroborationsCount: headPayload?.detail?.corroborations?.length,
				corroborationsSet: [...new Set(headPayload?.detail?.corroborations ?? [])].sort(),
			}).toEqual({
				headExists: true,
				ciEligible: true,
				corroborationsCount: 3,
				corroborationsSet: ['harvester:claude_jsonl', 'harvester:editor_save', 'harvester:git_commit'],
			});
		} finally { close(); }
	});

	it('2 distinct sources do NOT flip yet but corroborations array updated', async () => {
		const { db, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			const { id } = dao.seed({
				payload: { kind: 'ConstraintNode', body: 'under-threshold target', anchor: { file: 'src/y.ts' } },
				provenance: { source: 'harvester:promoter', actor: 'promoter' },
				confidence: 'Inferred',
			});

			await incrementCorroborationAndMaybePromote({ dao, nodeId: id, observationProvenanceSource: 'harvester:claude_jsonl' });
			await incrementCorroborationAndMaybePromote({ dao, nodeId: id, observationProvenanceSource: 'harvester:editor_save' });

			let cursor = id;
			let next = dao.findSuccessor(cursor);
			while (next) {
				cursor = next.id;
				next = dao.findSuccessor(cursor);
			}
			const head = dao.queryById(cursor);
			const headPayload = head?.payload as { cite_eligible?: boolean; detail?: { corroborations?: string[] } } | undefined;

			expect({
				ciEligible: !!headPayload?.cite_eligible,
				corroborationsCount: headPayload?.detail?.corroborations?.length,
			}).toEqual({
				ciEligible: false,
				corroborationsCount: 2,
			});
		} finally { close(); }
	});

	it('5 concurrent observations with same anchor serialize via promotion-gate queue (Pitfall 9 race)', async () => {
		const { db, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			const { id } = dao.seed({
				payload: { kind: 'ConstraintNode', body: 'concurrent target', anchor: { file: 'src/z.ts' } },
				provenance: { source: 'harvester:promoter', actor: 'promoter' },
				confidence: 'Inferred',
			});

			const sources = ['s1', 's2', 's3', 's4', 's5'];
			await Promise.all(sources.map((s) =>
				incrementCorroborationAndMaybePromote({ dao, nodeId: id, observationProvenanceSource: s }),
			));

			let cursor = id;
			let next = dao.findSuccessor(cursor);
			while (next) {
				cursor = next.id;
				next = dao.findSuccessor(cursor);
			}
			const head = dao.queryById(cursor);
			const headPayload = head?.payload as { cite_eligible?: boolean; detail?: { corroborations?: string[] } } | undefined;
			const finalSet = new Set(headPayload?.detail?.corroborations ?? []);

			expect({
				ciEligible: !!headPayload?.cite_eligible,
				finalUniqueCount: finalSet.size,
				containsAll: sources.every((s) => finalSet.has(s)),
			}).toEqual({
				ciEligible: true,    // 5 distinct sources >= N=3 threshold
				finalUniqueCount: 5,
				containsAll: true,
			});
		} finally { close(); }
	});
});
