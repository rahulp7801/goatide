/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/integration/sc5-promotion-paths.spec.ts — Phase 5 Plan 05-08.
//
// ROADMAP SC #5 — "Developer accepts a Canvas decision that cites an Inferred candidate
// node, and the node's `cite-eligible` flag flips to true (Canvas-decision promotion gate);
// a separate Inferred node accumulates ≥N independent corroborations and the same flag
// flips automatically."
//
// Two independent paths walked in one spec (matches the must_have contract):
//   (a) Canvas-Accept path: seed an Inferred ConstraintNode; create a fake
//       Attempt(attempt_kind='accepted') with a 'references' edge to the Inferred node;
//       call flipCiteEligibleOnAcceptedReceipt; assert the node was superseded with
//       cite_eligible=true via dao.supersede (Mandate-B compliant).
//   (b) Corroboration path: seed an Inferred ConstraintNode; submit 3 distinct-source
//       observations matching the same anchor tuple by exact body; assert after the 3rd
//       the node's latest version has cite_eligible=true; supersession chain length === 3.
//
// Both paths use the in-process orchestrator + Plan 05-06 fixture-replay (no live LLM call).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { flipCiteEligibleOnAcceptedReceipt } from '../../../harvester/promotion-gate/canvas-decision-listener.js';
import { incrementCorroborationAndMaybePromote } from '../../../harvester/promotion-gate/index.js';
import { makeHarness, followToHead, countSupersedesChain, type IntegrationHarness } from './_setup.js';

describe('ROADMAP SC #5 — promotion gate (a) Canvas-accept and (b) ≥3 corroborations both flip cite_eligible', () => {
	let harness: IntegrationHarness;

	beforeEach(() => {
		harness = makeHarness({ workspaceFolders: ['/repo'] });
	});

	afterEach(() => {
		harness.dispose();
	});

	it('PORT-05 (a): Attempt(accepted) → references → Inferred citation flips cite_eligible via dao.supersede', async () => {
		// Seed Inferred candidate.
		const { id: inferredId } = harness.dao.seed({
			payload: {
				kind: 'ConstraintNode',
				body: 'Discount must use BigDecimal arithmetic to avoid float precision drift in cart subtotal.',
				anchor: { file: '/repo/src/checkout/calculator.ts' },
			},
			provenance: { source: 'harvester:promoter', actor: 'promoter' },
			confidence: 'Inferred',
		});

		// Seed Canvas Attempt(accepted) + references edge.
		const { id: attemptId } = harness.dao.seed({
			payload: { kind: 'Attempt', body: 'Accepted on canvas', attempt_kind: 'accepted', tier: 'modal', accept_latency_ms: 1234 },
			provenance: { source: 'canvas', actor: 'developer' },
		});
		harness.dao.writeEdge({ kind: 'references', src_id: attemptId, dst_id: inferredId });

		// Run the listener — same flow that atomicAccept invokes after seeding the Attempt.
		await flipCiteEligibleOnAcceptedReceipt({ dao: harness.dao, attemptId });

		// Assert: original invalidated, successor exists, successor.confidence='Inferred',
		// successor.payload.cite_eligible=true, supersedes edge points new -> old.
		const oldRow = harness.dao.queryById(inferredId);
		const head = followToHead(harness, inferredId);
		const headPayload = head.payload as { kind?: string; cite_eligible?: boolean };
		const supersedesEdgeCount = harness.dbHandle.sqlite.prepare(
			`SELECT count(*) as n FROM edges WHERE kind='supersedes' AND dst_id = ?`,
		).get(inferredId) as { n: number };

		expect({
			oldInvalidated: oldRow?.invalidated_at !== null,
			headDifferent: head.id !== inferredId,
			headConfidence: head.confidence,
			headCiteEligible: headPayload.cite_eligible,
			headKind: headPayload.kind,
			supersedesEdgeCount: supersedesEdgeCount.n,
		}).toEqual({
			oldInvalidated: true,
			headDifferent: true,
			headConfidence: 'Inferred',
			headCiteEligible: true,
			headKind: 'ConstraintNode',
			supersedesEdgeCount: 1,
		});
	});

	it('PORT-05 (b): 3 distinct provenance.source values flip cite_eligible; supersession chain length === 3', async () => {
		const { id: inferredId } = harness.dao.seed({
			payload: {
				kind: 'ConstraintNode',
				body: 'JWT signing keys must rotate every 90 days; older tokens remain valid until natural expiry.',
				anchor: { file: '/repo/src/auth/jwt.ts' },
			},
			provenance: { source: 'harvester:promoter', actor: 'promoter' },
			confidence: 'Inferred',
		});

		// Increment corroboration counter once per distinct source. Default threshold N=3.
		await incrementCorroborationAndMaybePromote({
			dao: harness.dao,
			nodeId: inferredId,
			observationProvenanceSource: 'harvester:claude_jsonl',
		});
		const after1 = followToHead(harness, inferredId);
		const after1Payload = after1.payload as { cite_eligible?: boolean; detail?: { corroborations?: string[] } };

		await incrementCorroborationAndMaybePromote({
			dao: harness.dao,
			nodeId: inferredId,
			observationProvenanceSource: 'harvester:editor_save',
		});
		const after2 = followToHead(harness, inferredId);
		const after2Payload = after2.payload as { cite_eligible?: boolean; detail?: { corroborations?: string[] } };

		await incrementCorroborationAndMaybePromote({
			dao: harness.dao,
			nodeId: inferredId,
			observationProvenanceSource: 'harvester:git_commit',
		});
		const after3 = followToHead(harness, inferredId);
		const after3Payload = after3.payload as { cite_eligible?: boolean; detail?: { corroborations?: string[] } };

		const chainLength = countSupersedesChain(harness, inferredId);

		expect({
			after1Eligible: after1Payload.cite_eligible === true,
			after1Corrobs: after1Payload.detail?.corroborations?.length,
			after2Eligible: after2Payload.cite_eligible === true,
			after2Corrobs: after2Payload.detail?.corroborations?.length,
			after3Eligible: after3Payload.cite_eligible === true,
			after3Corrobs: after3Payload.detail?.corroborations?.length,
			after3CorrobsSet: [...new Set(after3Payload.detail?.corroborations ?? [])].sort(),
			chainLength,
			headConfidence: after3.confidence,
		}).toEqual({
			after1Eligible: false,
			after1Corrobs: 1,
			after2Eligible: false,
			after2Corrobs: 2,
			after3Eligible: true,
			after3Corrobs: 3,
			after3CorrobsSet: ['harvester:claude_jsonl', 'harvester:editor_save', 'harvester:git_commit'],
			chainLength: 3,
			headConfidence: 'Inferred',
		});
	});
});
