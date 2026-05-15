/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/drift/constraint-lift.ts — Phase 16 Plan 16-02 DEEP-03 hypothetical-impact analyzer.
//
// Read-only walk seeded from a ConstraintNode (NOT ContractNode — that's runRippleAnalysis).
// Reuses walkRippleEdges from ripple.ts (exported in Wave 0). Same SQL shape; different anchor.
//
// Mandate B: this module NEVER calls proposeEdit / atomicAccept / recordRejection /
// recordContractOverride. refuse-deep05-write.sh CI gate enforces this structurally.
//
// Pitfall 1 (REC-03 single-snapshot invariant): zero Date.now() / new Date() in this module.
// asOf threads verbatim from input → walkRippleEdges. generated_at is set to input.asOf
// for deterministic, time-of-query-free responses.

import type Database from 'better-sqlite3';
import type { GraphDAO } from '../graph/dao.js';
import type { ComplianceReport, ComplianceRow } from './types.js';
import { walkRippleEdges } from './ripple.js';

export interface RunConstraintLiftInput {
	readonly constraintNodeId: string;
	readonly maxHops: 1 | 2 | 3;   // literal-union cap — refuse-unbounded-ripple-walk gate enforces
	readonly asOf: string;
	readonly confidenceThreshold?: number;  // 0.0..1.0; default 0.5 (Wave 1)
	readonly dao: GraphDAO;
	readonly sqlite: Database.Database;
	readonly nodeCap?: number;
}

export interface ConstraintLiftRow extends ComplianceRow {
	readonly confidence_band: 'explicit' | 'inferred';
}

export interface ConstraintLiftResult {
	readonly hypothetical_impact: ComplianceReport;
	readonly confidence_score: number;   // 0.0..1.0 aggregate
}

// -------- File-local helpers --------

/**
 * Extract the first edge kind from a Phase-4 traverse edge_path string.
 * Mirrors parseFirstEdgeKind in ripple.ts — inlined here to avoid exporting a private helper.
 */
const FIRST_EDGE_ALLOWLIST = ['protects', 'references', 'parent_of', 'supersedes', 'derived_from'] as const;
type FirstEdgeKind = typeof FIRST_EDGE_ALLOWLIST[number] | 'unknown';

function parseFirstEdgeKind(edgePath: string): FirstEdgeKind {
	if (edgePath.length === 0) {
		return 'unknown';
	}
	const segments = edgePath.split('/').filter((s) => s.length > 0);
	if (segments.length === 0) {
		return 'unknown';
	}
	const colonIdx = segments[0]!.indexOf(':');
	const kind = colonIdx === -1 ? segments[0]! : segments[0]!.slice(0, colonIdx);
	for (const allowed of FIRST_EDGE_ALLOWLIST) {
		if (kind === allowed) {
			return allowed;
		}
	}
	return 'unknown';
}

/**
 * Attach confidence_band to a ComplianceRow by looking up the source NodeRow via dao.queryById.
 * Defensive default: if the node is not found or confidence is missing, defaults to 'inferred'.
 * Spread operator creates a new object — never mutates the input row in-place (Pitfall 4 fence).
 */
function attachConfidenceBand(row: ComplianceRow, dao: GraphDAO): ConstraintLiftRow {
	const node = dao.queryById(row.node_id);
	const confidence = node?.confidence ?? 'Inferred';
	return { ...row, confidence_band: confidence === 'Explicit' ? 'explicit' : 'inferred' };
}

/**
 * Two-pass stable sort within a bucket:
 *   Pass 1: 'explicit' confidence_band rows first.
 *   Pass 2 (within each confidence group): [hops asc, node_id asc] secondary ordering.
 *
 * V8/Node 22+ Array.prototype.sort is stable — Phase 14 Plan 14-04 precedent.
 * Mutates the array in-place (caller passes a bucket array, not the original rows).
 */
function sortByConfidenceThenHops(rows: ConstraintLiftRow[]): void {
	rows.sort((a, b) => {
		if (a.confidence_band !== b.confidence_band) {
			return a.confidence_band === 'explicit' ? -1 : 1;
		}
		if (a.hops !== b.hops) {
			return a.hops - b.hops;
		}
		return a.node_id.localeCompare(b.node_id);
	});
}

/**
 * Phase 16 Plan 16-02 DEEP-03 — real body.
 *
 * Walks outgoing parent_of/references/derived_from/protects edges from the ConstraintNode
 * via walkRippleEdges, classifies the resulting rows into definitely/potentially-affected
 * buckets (same logic as runRippleAnalysis), attaches confidence_band from the source
 * NodeRow's confidence column, two-pass sorts each bucket (Explicit-first, then
 * [hops asc, node_id asc]), and computes the confidence_score aggregate.
 *
 * Pitfall 1 fence: zero Date.now() / new Date() in this function. generated_at is set to
 * input.asOf for deterministic, time-of-query-free responses.
 *
 * Mandate B fence: no write-RPC call (proposeEdit / atomicAccept / recordRejection /
 * recordContractOverride). The constraint-lift flow is read-only end-to-end.
 *
 * @returns ConstraintLiftResult — hypothetical_impact (ComplianceReport) + confidence_score.
 */
export function runConstraintLiftAnalysis(input: RunConstraintLiftInput): ConstraintLiftResult {
	const nodeCap = input.nodeCap ?? 2000;  // same default as Plan 14 — configurable for tests

	// Walk the BFS from the ConstraintNode anchor; includes the anchor itself at level=0.
	const allRows = walkRippleEdges(input.sqlite, input.constraintNodeId, input.maxHops, input.asOf);

	// Filter out the anchor itself (level=0); sort deterministically: [hops asc, node_id asc].
	let downstream = allRows.filter((r) => r.level > 0);
	downstream.sort((a, b) => {
		if (a.level !== b.level) {
			return a.level - b.level;
		}
		return a.node_id < b.node_id ? -1 : (a.node_id > b.node_id ? 1 : 0);
	});

	// Apply nodeCap BEFORE classification (consistent with runRippleAnalysis pattern).
	const truncated = downstream.length > nodeCap;
	if (truncated) {
		downstream = downstream.slice(0, nodeCap);
	}

	// Classify into definitely_affected / potentially_affected buckets (same logic as runRippleAnalysis).
	const definitelyRaw: ComplianceRow[] = [];
	const potentiallyRaw: ComplianceRow[] = [];
	for (const row of downstream) {
		const firstKind = parseFirstEdgeKind(row.edge_path);
		const complianceRow: ComplianceRow = {
			node_id: row.node_id,
			kind: row.kind,
			anchor_file: row.payload.anchor?.file,
			edge_path: row.edge_path,
			hops: row.level,
			body_preview: (typeof (row.payload as { body?: unknown }).body === 'string'
				? (row.payload as { body: string }).body
				: '').slice(0, 120),
		};
		if (firstKind === 'protects') {
			definitelyRaw.push(complianceRow);
		} else if (firstKind === 'references' || firstKind === 'parent_of') {
			potentiallyRaw.push(complianceRow);
		}
		// 'derived_from' / 'supersedes' / 'unknown' → omitted (audit-trail edges).
	}

	// Attach confidence_band to each row via dao.queryById lookup.
	// Uses spread {...row} to avoid in-place mutation (Pitfall 4 fence).
	const definitely: ConstraintLiftRow[] = definitelyRaw.map((r) => attachConfidenceBand(r, input.dao));
	const potentially: ConstraintLiftRow[] = potentiallyRaw.map((r) => attachConfidenceBand(r, input.dao));

	// Two-pass stable sort within each bucket: Explicit-first, then [hops asc, node_id asc].
	sortByConfidenceThenHops(definitely);
	sortByConfidenceThenHops(potentially);

	// Compute confidence_score = num_explicit / total_rows. Score = 1.0 when no rows (vacuously true).
	const totalRows = definitely.length + potentially.length;
	const explicitCount = definitely.filter((r) => r.confidence_band === 'explicit').length
		+ potentially.filter((r) => r.confidence_band === 'explicit').length;
	const confidence_score = totalRows === 0 ? 1.0 : explicitCount / totalRows;

	return {
		hypothetical_impact: {
			contract_node_id: input.constraintNodeId,  // ComplianceReport field name reused per research §5
			max_hops: input.maxHops,
			definitely_affected: definitely,
			potentially_affected: potentially,
			truncated,
			generated_at: input.asOf,  // Pitfall 1 fence: no Date.now()/new Date() — asOf is the anchor
		},
		confidence_score,
	};
}
