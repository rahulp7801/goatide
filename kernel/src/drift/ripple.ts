/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/drift/ripple.ts — Phase 7 (Plan 07-04) DRIFT-04 + DRIFT-05 ripple analyzer.
//
// runRippleAnalysis classifies the BFS-reachable downstream of a ContractNode into a
// constitutional tri-bucket per the FIRST edge kind in each node's edge_path:
//   - 'protects' → definitely_affected
//   - 'references' / 'parent_of' → potentially_affected
//   - 'derived_from' / 'supersedes' / 'unknown' → OMITTED (audit-trail edges)
//
// REUSE NOTE: this module is a thin wrapper around Phase-4 W12-rewritten traverse() — it
// adds zero new graph traversal code. The 3-hop cap is constitutional:
//   - TypeScript: input.maxHops is a literal-union (1 | 2 | 3); callers cannot pass 4+.
//   - CI gate (refuse-unbounded-ripple-walk.sh): static-greps `max_hops:` literals in this
//     file and asserts every value is ≤ 3.
// Both layers must agree to satisfy DRIFT-05 + Pitfall 4.
//
// PITFALL-4 NODE_CAP DEFENSE: a ContractNode connected to a hub library can produce a
// 125,000-node blast radius at 3 hops via combinatorial explosion. The optional `nodeCap`
// parameter (default 1000; env GOATIDE_DRIFT_NODE_CAP override) truncates BFS output to
// the first `nodeCap` rows (sorted deterministically by [hops asc, node_id asc]) and sets
// ComplianceReport.truncated = true so the UI can show 'showing N of M affected nodes'.

import type Database from 'better-sqlite3';
import type { TraverseRow } from '../graph/traverse.js';
import type { GraphDAO } from '../graph/dao.js';
import type { EdgeKind } from '../graph/schema/edges.js';
import type { ComplianceReport, ComplianceRow } from './types.js';

/**
 * Input parameters for {@link runRippleAnalysis}.
 *
 * @property contractNodeId The ContractNode ULID — the seed of the BFS walk.
 * @property maxHops        Literal-union 1|2|3. TypeScript prevents 4+ at compile time.
 * @property asOf           ISO-8601 transaction time for the bitemporal traverse.
 * @property dao            GraphDAO instance (currently only used for type symmetry; the
 *                          implementation reads via traverse(sqlite, ...) directly).
 * @property sqlite         Raw better-sqlite3 handle — passed to traverse().
 * @property nodeCap        Pitfall-4 cap. Defaults to env GOATIDE_DRIFT_NODE_CAP or 1000.
 */
export interface RunRippleAnalysisInput {
	readonly contractNodeId: string;
	readonly maxHops: 1 | 2 | 3;
	readonly asOf: string;
	readonly dao: GraphDAO;
	readonly sqlite: Database.Database;
	readonly nodeCap?: number;
}

/** Allowlist of edge kinds we narrow the first-edge-kind to without `as any`. */
const FIRST_EDGE_ALLOWLIST = ['protects', 'references', 'parent_of', 'supersedes', 'derived_from'] as const;
type FirstEdgeKind = typeof FIRST_EDGE_ALLOWLIST[number] | 'unknown';

/**
 * Extract the first edge kind from a Phase-4 traverse edge_path string.
 *
 * Format (from kernel/src/graph/traverse.ts): edge_path is empty for level=0 (the anchor)
 * and `/<kind>:<edge_id>[/...]` for level≥1. We split on '/', drop empties, take the first
 * segment, then split on ':' and take the kind portion.
 *
 * Returns 'unknown' for empty paths (the contract itself; omitted from reports anyway) or
 * for any kind not in {@link FIRST_EDGE_ALLOWLIST}. The allowlist matches EDGE_KINDS but
 * declared independently here so the narrowing is explicit (Mandate-C: no `as any`).
 */
function parseFirstEdgeKind(edgePath: string): FirstEdgeKind {
	if (edgePath.length === 0) {
		return 'unknown';
	}
	const segments = edgePath.split('/').filter((s) => s.length > 0);
	if (segments.length === 0) {
		return 'unknown';
	}
	const colonIdx = segments[0].indexOf(':');
	const kind = colonIdx === -1 ? segments[0] : segments[0].slice(0, colonIdx);
	for (const allowed of FIRST_EDGE_ALLOWLIST) {
		if (kind === allowed) {
			return allowed;
		}
	}
	return 'unknown';
}

/** Convert a traverse row into a ComplianceRow shape. */
function toComplianceRow(row: TraverseRow): ComplianceRow {
	const anchorFile = row.payload.anchor?.file;
	const body: string = typeof (row.payload as { body?: unknown }).body === 'string'
		? (row.payload as { body: string }).body
		: '';
	return {
		node_id: row.node_id,
		kind: row.kind,
		anchor_file: anchorFile,
		edge_path: row.edge_path,
		hops: row.level,
		body_preview: body.slice(0, 120),
	};
}

/**
 * Resolve the effective nodeCap from {@link input} or environment override. Defaults to 1000.
 *
 * Env var: GOATIDE_DRIFT_NODE_CAP (parsed via parseInt; non-finite values fall back to 1000).
 */
function resolveNodeCap(inputCap: number | undefined): number {
	if (typeof inputCap === 'number' && Number.isFinite(inputCap) && inputCap > 0) {
		return inputCap;
	}
	const envRaw = process.env.GOATIDE_DRIFT_NODE_CAP;
	if (envRaw !== undefined) {
		const parsed = Number.parseInt(envRaw, 10);
		if (Number.isFinite(parsed) && parsed > 0) {
			return parsed;
		}
	}
	return 1000;
}

/**
 * Walk the downstream blast radius of {@link input.contractNodeId} via Phase-4 traverse()
 * and classify each reachable node into the constitutional tri-bucket.
 *
 * Synchronous (better-sqlite3 is sync). Returns a ComplianceReport with `truncated:true`
 * iff the unfiltered BFS exceeded `nodeCap`. The unaffected (derived_from / supersedes /
 * unknown) bucket is OMITTED entirely; the bridge UI shows 'no other reachable nodes' for
 * cases where every reachable row landed in that bucket.
 *
 * Determinism: the underlying traverse() emits rows sorted by (level asc, node_id asc); we
 * preserve that ordering after filtering, then truncate to nodeCap if needed.
 *
 * @returns ComplianceReport — definitely_affected + potentially_affected sorted by
 *          [hops asc, node_id asc] within each bucket.
 */
export function runRippleAnalysis(input: RunRippleAnalysisInput): ComplianceReport {
	// Suppress unused-parameter warning — `dao` is reserved for Plan 07-07 (bridge save-gate)
	// which may pass GraphDAO through for future fan-out caching. The current implementation
	// reads via raw better-sqlite3 (mirrors traverse()).
	void input.dao;

	const nodeCap = resolveNodeCap(input.nodeCap);
	// IMPLEMENTATION NOTE: Phase-4 traverse() does NOT include 'protects' in SCOPE_KINDS['all']
	// (it walks parent_of + references + derived_from only — supersession chains and audit-trail
	// edges). Phase-7 ripple analysis MUST include 'protects' (the constitutional impact edge),
	// so we use a focused per-level SQL walk in this module rather than modifying traverse().
	// The walk shape mirrors traverse() exactly (active-edges-only, json_each frontier, visited-
	// set guard, lex-min edge_path retention).
	const baseRows = walkRippleEdges(input.sqlite, input.contractNodeId, input.maxHops, input.asOf);

	// Filter out the anchor itself (level=0).
	let withoutAnchor = baseRows.filter((r) => r.level > 0);
	// Sort deterministically: [hops asc, node_id asc].
	withoutAnchor.sort((a, b) => {
		if (a.level !== b.level) {
			return a.level - b.level;
		}
		return a.node_id < b.node_id ? -1 : (a.node_id > b.node_id ? 1 : 0);
	});

	// Apply Pitfall-4 nodeCap defense BEFORE classification (so all classification runs on
	// the same row set the report exposes).
	let truncated = false;
	if (withoutAnchor.length > nodeCap) {
		withoutAnchor = withoutAnchor.slice(0, nodeCap);
		truncated = true;
	}

	const definitely_affected: ComplianceRow[] = [];
	const potentially_affected: ComplianceRow[] = [];
	for (const row of withoutAnchor) {
		const firstKind = parseFirstEdgeKind(row.edge_path);
		const complianceRow = toComplianceRow(row);
		if (firstKind === 'protects') {
			definitely_affected.push(complianceRow);
		} else if (firstKind === 'references' || firstKind === 'parent_of') {
			potentially_affected.push(complianceRow);
		}
		// 'derived_from' / 'supersedes' / 'unknown' → omitted by design (audit-trail edges).
	}

	return {
		contract_node_id: input.contractNodeId,
		max_hops: input.maxHops,
		definitely_affected,
		potentially_affected,
		truncated,
		generated_at: new Date().toISOString(),
	};
}

/**
 * Iterative BFS over (parent_of | references | derived_from | protects) edges, mirroring
 * Phase-4 traverse() semantics but explicitly including 'protects' in the kind filter.
 *
 * One SQL query per level — O(reachable_nodes) walk row count. Visited Set prevents cycles
 * + dedup. Per-level ordering is (next_id ASC, edge_kind ASC, edge_id ASC) so the first
 * edge_path retained per node is the lexically-minimum one (matches traverse's MIN-edge_path
 * semantics).
 *
 * @returns rows including the anchor at level=0; caller filters as needed. edge_path for
 *          level=0 is `''`; for level≥1 is `/<kind>:<edge_id>[/...]`.
 */
function walkRippleEdges(
	sqlite: Database.Database,
	anchorId: string,
	maxHops: 1 | 2 | 3,
	asOf: string,
): TraverseRow[] {
	// Seed query — fetch the anchor row at level 0.
	const seedStmt = sqlite.prepare(`
		SELECT n.id AS node_id,
		       n.kind, n.payload, n.confidence,
		       n.valid_from, n.invalidated_at, n.recorded_at, n.superseded_by
		FROM nodes n
		WHERE n.id = ?
		  AND n.valid_from <= ?
		  AND (n.invalidated_at IS NULL OR n.invalidated_at > ?)
		  AND n.recorded_at <= ?
	`);
	const seedRows = seedStmt.all(anchorId, asOf, asOf, asOf) as Array<{
		node_id: string;
		kind: string;
		payload: string;
		confidence: string;
		valid_from: string;
		invalidated_at: string | null;
		recorded_at: string;
		superseded_by: string | null;
	}>;

	if (seedRows.length === 0) {
		return [];
	}

	const accum = new Map<string, TraverseRow>();
	const visited = new Set<string>();
	for (const r of seedRows) {
		accum.set(r.node_id, materializeTraverseRow(r, 0, ''));
		visited.add(r.node_id);
	}

	// Per-level expansion query — `json_each(@frontier_json)` materializes the frontier
	// without re-preparing per level. KIND_FILTER includes 'protects' (the Phase-7 addition);
	// 'supersedes' is excluded (audit chain, not retrieval).
	const KIND_FILTER: ReadonlyArray<EdgeKind> = ['parent_of', 'references', 'derived_from', 'protects'];
	const kindPlaceholders = KIND_FILTER.map(() => '?').join(',');
	const stepStmt = sqlite.prepare(`
		WITH frontier(node_id, edge_path) AS (
			SELECT
				json_extract(value, '$.id')   AS node_id,
				json_extract(value, '$.path') AS edge_path
			FROM json_each(@frontier_json)
		),
		step_edges(prev_id, prev_path, next_id, edge_kind, edge_id) AS (
			SELECT f.node_id, f.edge_path, e.dst_id, e.kind, e.id
			FROM frontier f
			JOIN edges e INDEXED BY idx_edges_active_src ON e.src_id = f.node_id
			WHERE e.invalidated_at IS NULL
			  AND e.kind IN (${kindPlaceholders})
			  AND e.valid_from <= @at
			  AND e.recorded_at <= @at
		)
		SELECT
			s.prev_id           AS prev_id,
			s.prev_path         AS prev_path,
			s.next_id           AS next_id,
			s.edge_kind         AS edge_kind,
			s.edge_id           AS edge_id,
			n.kind              AS node_kind,
			n.payload           AS payload,
			n.confidence        AS confidence,
			n.valid_from        AS valid_from,
			n.invalidated_at    AS invalidated_at,
			n.recorded_at       AS recorded_at,
			n.superseded_by     AS superseded_by
		FROM step_edges s
		JOIN nodes n
			ON n.id = s.next_id
		   AND n.valid_from <= @at
		   AND (n.invalidated_at IS NULL OR n.invalidated_at > @at)
		   AND n.recorded_at <= @at
		ORDER BY s.next_id ASC, s.edge_kind ASC, s.edge_id ASC
	`);

	let frontier: Array<{ id: string; path: string }> = seedRows.map((r) => ({ id: r.node_id, path: '' }));
	for (let level = 0; level < maxHops && frontier.length > 0; level++) {
		const frontierJson = JSON.stringify(frontier);
		const rows = stepStmt.all(...KIND_FILTER, { at: asOf, frontier_json: frontierJson }) as Array<{
			prev_id: string;
			prev_path: string;
			next_id: string;
			edge_kind: string;
			edge_id: string;
			node_kind: string;
			payload: string;
			confidence: string;
			valid_from: string;
			invalidated_at: string | null;
			recorded_at: string;
			superseded_by: string | null;
		}>;
		const nextFrontier: Array<{ id: string; path: string }> = [];
		for (const r of rows) {
			if (visited.has(r.next_id)) {
				continue;
			}
			const newPath = `${r.prev_path}/${r.edge_kind}:${r.edge_id}`;
			visited.add(r.next_id);
			accum.set(
				r.next_id,
				materializeTraverseRow(
					{
						node_id: r.next_id,
						kind: r.node_kind,
						payload: r.payload,
						confidence: r.confidence,
						valid_from: r.valid_from,
						invalidated_at: r.invalidated_at,
						recorded_at: r.recorded_at,
						superseded_by: r.superseded_by,
					},
					level + 1,
					newPath,
				),
			);
			nextFrontier.push({ id: r.next_id, path: newPath });
		}
		frontier = nextFrontier;
	}
	return Array.from(accum.values());
}

interface RawTraverseFields {
	node_id: string;
	kind: string;
	payload: string;
	confidence: string;
	valid_from: string;
	invalidated_at: string | null;
	recorded_at: string;
	superseded_by: string | null;
}

function materializeTraverseRow(row: RawTraverseFields, level: number, edgePath: string): TraverseRow {
	return {
		node_id: row.node_id,
		level,
		edge_path: edgePath,
		kind: row.kind as TraverseRow['kind'],
		payload: JSON.parse(row.payload) as TraverseRow['payload'],
		confidence: row.confidence as TraverseRow['confidence'],
		valid_from: row.valid_from,
		invalidated_at: row.invalidated_at,
		recorded_at: row.recorded_at,
		superseded_by: row.superseded_by,
	};
}

