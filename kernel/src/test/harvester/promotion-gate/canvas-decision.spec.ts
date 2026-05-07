/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/promotion-gate/canvas-decision.spec.ts — Phase 5 Plan 05-06 PORT-05(a).
//
// When a Phase-4 Canvas Accept lands on an Attempt(attempt_kind='accepted') whose first
// 'references' edge points to an Inferred ConstraintNode/DecisionNode/ContractNode/etc.,
// the listener flips that referenced node's cite_eligible flag via dao.supersede (Mandate-B
// compliance: a NEW row + supersedes edge, NEVER an in-place UPDATE).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkTempDb, type TempDb } from '../../helpers/temp-db.js';
import { openDatabase, GraphDAO } from '../../../graph/index.js';
import { flipCiteEligibleOnAcceptedReceipt } from '../../../harvester/promotion-gate/canvas-decision-listener.js';

describe('PORT-05 (a): Canvas Attempt(accepted) flips cite_eligible via supersede', () => {
	let tmp: TempDb;
	beforeEach(() => { tmp = mkTempDb(); });
	afterEach(() => { tmp.dispose(); });

	it('Phase-4 Attempt(attempt_kind=accepted) referencing Inferred node flips cite_eligible via dao.supersede (Mandate-B compliance)', async () => {
		const { db, sqlite, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			// Seed an Inferred ConstraintNode (the citation target).
			const { id: inferredId } = dao.seed({
				payload: { kind: 'ConstraintNode', body: 'Inferred candidate constraint', anchor: { file: 'src/x.ts' } },
				provenance: { source: 'harvester:promoter', actor: 'promoter' },
				confidence: 'Inferred',
			});

			// Seed an Attempt(attempt_kind=accepted) and an edge from Attempt -> InferredCitation.
			const { id: attemptId } = dao.seed({
				payload: { kind: 'Attempt', body: 'Accept on canvas', attempt_kind: 'accepted' },
				provenance: { source: 'canvas', actor: 'developer' },
			});
			dao.writeEdge({ kind: 'references', src_id: attemptId, dst_id: inferredId });

			// Run the listener — this is what atomicAccept calls after seeding the Attempt.
			await flipCiteEligibleOnAcceptedReceipt({ dao, attemptId });

			// Verify: original inferredId is now invalidated; a successor row exists with
			// cite_eligible=true; supersedes edge connects new -> old.
			const oldRow = dao.queryById(inferredId);
			const successor = dao.findSuccessor(inferredId);
			const supersedesEdgeCount = sqlite.prepare(
				`SELECT count(*) as n FROM edges WHERE kind='supersedes' AND dst_id = ?`,
			).get(inferredId) as { n: number };

			expect({
				oldInvalidated: oldRow?.invalidated_at !== null,
				successorExists: !!successor,
				successorConfidence: successor?.confidence,
				successorCiteEligible: (successor?.payload as { cite_eligible?: boolean } | undefined)?.cite_eligible,
				supersedesEdgeCount: supersedesEdgeCount.n,
				newIdDifferentFromOld: !!successor && successor.id !== inferredId,
			}).toEqual({
				oldInvalidated: true,
				successorExists: true,
				successorConfidence: 'Inferred',
				successorCiteEligible: true,
				supersedesEdgeCount: 1,
				newIdDifferentFromOld: true,
			});
		} finally { close(); }
	});

	it('Reject Attempt does NOT flip cite_eligible', async () => {
		const { db, sqlite, close } = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(db);
		try {
			const { id: inferredId } = dao.seed({
				payload: { kind: 'ConstraintNode', body: 'Another inferred constraint', anchor: { file: 'src/y.ts' } },
				provenance: { source: 'harvester:promoter', actor: 'promoter' },
				confidence: 'Inferred',
			});
			const { id: attemptId } = dao.seed({
				payload: { kind: 'Attempt', body: 'Rejected attempt', attempt_kind: 'rejected' },
				provenance: { source: 'canvas', actor: 'developer' },
			});
			dao.writeEdge({ kind: 'references', src_id: attemptId, dst_id: inferredId });

			await flipCiteEligibleOnAcceptedReceipt({ dao, attemptId });

			const oldRow = dao.queryById(inferredId);
			const successor = dao.findSuccessor(inferredId);
			const supersedesEdgeCount = sqlite.prepare(
				`SELECT count(*) as n FROM edges WHERE kind='supersedes' AND dst_id = ?`,
			).get(inferredId) as { n: number };

			expect({
				oldInvalidated: oldRow?.invalidated_at !== null,
				successorExists: !!successor,
				supersedesEdgeCount: supersedesEdgeCount.n,
			}).toEqual({
				oldInvalidated: false,
				successorExists: false,
				supersedesEdgeCount: 0,
			});
		} finally { close(); }
	});
});
