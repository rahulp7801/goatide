/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/graph/dao.ts — Phase 2 (Plan 02-03) the only mutation surface above raw
// better-sqlite3.
//
// Per 02-RESEARCH.md ## Pattern: DAO Boundary, the entire codebase has ONE module that
// imports drizzle's mutation functions: this file. Anything else (CLI, future kernel
// JSON-RPC, tests that don't intentionally bypass) calls into the DAO.
//
// Pitfalls applied:
//   - Pitfall 3: better-sqlite3 transactions are SYNCHRONOUS. We validate inputs with Zod
//     BEFORE entering db.transaction; we generate ULIDs and timestamps OUTSIDE the
//     transaction so the inner function stays synchronous and side-effect-free.
//   - Pitfall 6: RAISE(ABORT) only rolls back the offending statement. db.transaction
//     throws on SqliteError → host's catch rolls back the whole transaction. We do NOT
//     catch-and-swallow inside; friendly errors are formatted by callers.
//   - Pitfall 7: At supersession time we capture ONE timestamp and use it for
//     old.invalidated_at, new.valid_from, new.recorded_at, AND the supersedes edge's
//     valid_from + recorded_at — so all five align to one instant.
//
// Anti-patterns deliberately NOT provided:
//   - No `delete()`. The graph is append-only.
//   - No generic `update()`. The only mutation shapes are seed and supersede.
//   - No `raw()` escape hatch. Tests that need to bypass the DAO use better-sqlite3
//     directly (see triggers.spec.ts, ghosting.spec.ts CHECK-layer suite).

import { eq, and, isNull, lte, gt, or } from 'drizzle-orm';
import type { BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import type Database from 'better-sqlite3';
import { ulid } from 'ulid';

type BetterSqliteHandle = Database.Database;

import { nodes, type NodeKind, type Confidence } from './schema/nodes.js';
import { edges, type EdgeKind } from './schema/edges.js';
import { provenance } from './schema/provenance.js';
import {
	NodePayloadSchema,
	ProvenanceInputSchema,
	type NodePayload,
	type ProvenanceInput,
} from './payloads.js';

export interface SeedInput {
	payload: NodePayload;
	provenance: ProvenanceInput;
	/**
	 * Confidence level for the new row. Defaults to 'Explicit' (Phase 2 default — every
	 * CLI / Canvas / OpenQuestion / Attempt seed lands as Explicit). Phase 5 Plan 05-06
	 * Promoter passes 'Inferred' for LLM-classified candidate nodes that must wait for
	 * cite-eligibility promotion (Canvas accept or N corroborations) before becoming
	 * a citation source.
	 */
	confidence?: Confidence;
}

/** Input shape for {@link GraphDAO.writeEdge}. */
export interface WriteEdgeInput {
	kind: EdgeKind;
	src_id: string;
	dst_id: string;
}

/**
 * Inner-tx parameter shape from drizzle-orm's db.transaction(fn). Extracted via the
 * Parameters<Parameters<...>[0]>[0] pattern so the DAO's writeEdge overload can accept
 * an enclosing tx without re-deriving the type at each call site.
 *
 * Plan 02-03 SUMMARY documented `db.transaction(fn)` returning the callback's value
 * synchronously (not the raw better-sqlite3 callable shape); same drizzle 0.45.2 surface
 * is in play here. The inner tx exposes `.insert(...).values(...).run()` — same builder
 * shape as the outer db, with no transaction-management methods.
 */
export type WriteEdgeTx = Parameters<Parameters<BetterSQLite3Database['transaction']>[0]>[0];

export interface NodeRow {
	id: string;
	kind: NodeKind;
	payload: NodePayload;
	confidence: Confidence;
	valid_from: string;
	invalidated_at: string | null;
	recorded_at: string;
	superseded_by: string | null;
	/** Phase 17 Plan 17-04 DEEP-06 phase-B — repo_id from migration 0008. Default 'primary' for all pre-Phase-16 rows. */
	repo_id: string;
}

/**
 * Bitemporal edges row shape. Phase 15 Plan 15-01 (DEEP-02): the `queryEdgesAsOf` read API
 * returns this shape verbatim from the `edges` table. Wave-1 graph.queryGraphSnapshot RPC
 * (Plan 15-02) projects this row into a SerializedEdgeSnapshot for the inspector wire.
 */
export interface EdgeRow {
	id: string;
	kind: EdgeKind;
	src_id: string;
	dst_id: string;
	valid_from: string;
	invalidated_at: string | null;
	recorded_at: string;
	superseded_by: string | null;
	/** Phase 17 Plan 17-04 DEEP-06 phase-B — repo_id from migration 0008. Default 'primary' for all pre-Phase-16 rows. */
	repo_id: string;
}

export interface ProvenanceRow {
	node_id: string;
	source: string;
	actor: string;
	recorded_at: string;
	detail: Record<string, unknown> | null;
}

function nowIso(): string {
	return new Date().toISOString();
}

/**
 * GraphDAO — append-only, supersession-only API. The ONLY module above raw `Database`.
 * No `delete()`, no generic `update()`, no `raw()` escape hatch.
 */
export class GraphDAO {
	constructor(private readonly db: BetterSQLite3Database) { }

	/**
	 * Seed a typed node + its provenance row in a single synchronous transaction.
	 *
	 * @returns The generated node id (ULID).
	 * @throws  ZodError if payload fails validation (including the Ghosting refinement).
	 * @throws  SqliteError if any CHECK constraint or trigger fires (defense-in-depth).
	 */
	seed(input: SeedInput): { id: string } {
		// Pitfall 3: validate BEFORE transaction. Zod throws synchronously on failure.
		const payload = NodePayloadSchema.parse(input.payload);
		const prov = ProvenanceInputSchema.parse(input.provenance);
		const id = ulid();
		const ts = nowIso();
		const confidence: Confidence = input.confidence ?? 'Explicit';

		// drizzle-orm 0.45.2: db.transaction(fn) executes the function synchronously and
		// returns its return value (NOT a callable to invoke separately — that's the raw
		// better-sqlite3 API). Plan-output question resolved: trailing `()` would error
		// with "Type 'void' has no call signatures".
		this.db.transaction((tx) => {
			tx.insert(nodes).values({
				id,
				kind: payload.kind,
				payload,
				confidence,                        // 'Explicit' (Phase 2 default) | 'Inferred' (Phase 5 Promoter)
				valid_from: ts,
				recorded_at: ts,                  // explicit (Pitfall 7)
			}).run();
			tx.insert(provenance).values({
				node_id: id,
				source: prov.source,
				actor: prov.actor,
				recorded_at: ts,
				detail: prov.detail ?? null,
			}).run();
		});

		return { id };
	}

	/**
	 * Atomically supersede an existing active node. The transaction performs:
	 *   1. UPDATE old: set invalidated_at + superseded_by (only if currently active).
	 *   2. INSERT new: with same `kind` (the discriminator), new payload,
	 *      valid_from = ts, recorded_at = ts.
	 *   3. INSERT supersedes edge: src_id = newId, dst_id = oldId, valid_from = ts.
	 *
	 * One captured `ts` is reused for all five timestamps so the bitemporal
	 * invariant (Pitfall 7) is provable: old.invalidated_at ===
	 * new.valid_from === edge.valid_from.
	 *
	 * @throws Error  if `oldId` is not found OR is already superseded
	 *                (UPDATE row count !== 1).
	 * @throws ZodError if `newPayload` is invalid (Ghosting / unknown kind).
	 */
	supersede(oldId: string, newPayload: NodePayload, newProvenance?: ProvenanceInput): { newId: string } {
		const payload = NodePayloadSchema.parse(newPayload);
		const prov = newProvenance ? ProvenanceInputSchema.parse(newProvenance) : null;
		const newId = ulid();
		const ts = nowIso();

		this.db.transaction((tx) => {
			// 1. Read the OLD row's confidence so the new row preserves it. Phase 5
			//    Plan 05-06 promotion gate flips cite_eligible on Inferred nodes; the new
			//    superseding row stays Inferred (cite_eligible is what changes — confidence
			//    only flips on a future explicit promotion, which is out-of-scope for v1).
			const oldRow = tx.select({ confidence: nodes.confidence })
				.from(nodes).where(eq(nodes.id, oldId)).get();
			const oldConfidence: Confidence = (oldRow?.confidence as Confidence | undefined) ?? 'Explicit';

			// 2. Invalidate the old row, but ONLY if it is currently active.
			//    The `isNull(invalidated_at)` predicate is the idempotency guard:
			//    re-superseding an already-superseded id touches zero rows and we throw.
			const updateResult = tx.update(nodes)
				.set({ invalidated_at: ts, superseded_by: newId })
				.where(and(eq(nodes.id, oldId), isNull(nodes.invalidated_at)))
				.run();
			if (updateResult.changes !== 1) {
				throw new Error(`supersede: node ${oldId} not found or already superseded`);
			}

			// 3. Insert the new row at the same instant. Confidence preserves the old
			//    row's value so Inferred -> Inferred chains stay Inferred (the promotion
			//    gate flips cite_eligible inside the payload, not the confidence column).
			tx.insert(nodes).values({
				id: newId,
				kind: payload.kind,
				payload,
				confidence: oldConfidence,
				valid_from: ts,
				recorded_at: ts,
			}).run();

			// 4. Write the supersedes edge atomically.
			tx.insert(edges).values({
				id: ulid(),
				kind: 'supersedes' satisfies EdgeKind,
				src_id: newId,
				dst_id: oldId,
				valid_from: ts,
				recorded_at: ts,
			}).run();

			// 5. If newProvenance is supplied, write a provenance row keyed to the new id.
			//    The promotion gate uses this so the bitemporal audit trail records WHO
			//    flipped cite_eligible (canvas_decision vs corroboration_counter). Pre-Phase-5
			//    callers omit newProvenance and the provenance table grows by zero rows on
			//    supersession (back-compat — supersede.spec.ts expects the existing shape).
			if (prov) {
				tx.insert(provenance).values({
					node_id: newId,
					source: prov.source,
					actor: prov.actor,
					recorded_at: ts,
					detail: prov.detail ?? null,
				}).run();
			}
		});

		return { newId };
	}

	/**
	 * Append-only edge insert. The DAO has no delete or generic update; this is the third
	 * (and final) mutation surface alongside seed() and supersede().
	 *
	 * Caller-owned transaction overload: pass the inner tx parameter from db.transaction(fn)
	 * to enlist the edge insert in an enclosing tx. atomicAccept (kernel/src/rpc/server.ts —
	 * Plan 04-04) uses the no-arg form because dao.seed already runs its own tx; we accept
	 * a documented two-tx pattern (seed + writeEdge each in own tx — partial state would
	 * orphan the Attempt without an edge, which is survivable: the edge insert below is
	 * idempotent against the just-inserted Attempt).
	 *
	 * Validates kind ∈ EDGE_KINDS via the SQLite CHECK trigger; throws SqliteError on
	 * violation. ULID id; ts captured outside any tx (Pitfall 3).
	 */
	writeEdge(input: WriteEdgeInput): { id: string };
	writeEdge(input: WriteEdgeInput, tx: WriteEdgeTx): { id: string };
	writeEdge(input: WriteEdgeInput, tx?: WriteEdgeTx): { id: string } {
		const id = ulid();
		const ts = nowIso();
		const row = {
			id,
			kind: input.kind,
			src_id: input.src_id,
			dst_id: input.dst_id,
			valid_from: ts,
			recorded_at: ts,
		};
		if (tx) {
			tx.insert(edges).values(row).run();
		} else {
			this.db.transaction((innerTx) => {
				innerTx.insert(edges).values(row).run();
			});
		}
		return { id };
	}

	// -------- READ API --------

	queryById(id: string): NodeRow | null {
		const row = this.db.select().from(nodes).where(eq(nodes.id, id)).get();
		return row ? this.materialize(row) : null;
	}

	queryByKind(kind: NodeKind, asOf?: string): NodeRow[] {
		if (asOf) {
			return this.db.select().from(nodes).where(
				and(
					eq(nodes.kind, kind),
					lte(nodes.valid_from, asOf),
					or(isNull(nodes.invalidated_at), gt(nodes.invalidated_at, asOf)),
					lte(nodes.recorded_at, asOf),
				)
			).all().map((r) => this.materialize(r));
		}
		// Default: currently active rows of the given kind.
		return this.db.select().from(nodes).where(
			and(eq(nodes.kind, kind), isNull(nodes.invalidated_at))
		).all().map((r) => this.materialize(r));
	}

	queryAsOf(t: string): NodeRow[] {
		return this.db.select().from(nodes).where(
			and(
				lte(nodes.valid_from, t),
				or(isNull(nodes.invalidated_at), gt(nodes.invalidated_at, t)),
				lte(nodes.recorded_at, t),
			)
		).all().map((r) => this.materialize(r));
	}

	/**
	 * Phase 16 Plan 16-02 DEEP-06 phase-A — repo-scoped node read.
	 *
	 * Mirror of queryAsOf's predicate shape with an additional eq(nodes.repo_id, repoId)
	 * clause. All Phase-pre-16 rows backfill to repo_id='primary' via migration 0008,
	 * so queryByRepo('primary', asOf) returns the same row set as queryAsOf(asOf).
	 *
	 * @param repoId  Canonical repo identifier (e.g. 'primary' or fingerprint(remoteUrl)).
	 * @param asOf    ISO-8601 timestamp; bitemporal upper bound for valid_from + invalidated_at + recorded_at.
	 */
	queryByRepo(repoId: string, asOf: string): NodeRow[] {
		return this.db.select().from(nodes).where(
			and(
				eq(nodes.repo_id, repoId),
				lte(nodes.valid_from, asOf),
				or(isNull(nodes.invalidated_at), gt(nodes.invalidated_at, asOf)),
				lte(nodes.recorded_at, asOf),
			)
		).all().map((r) => this.materialize(r));
	}

	/**
	 * Bitemporal-filtered edges at the given asOf timestamp. Phase 15 Plan 15-01
	 * (DEEP-02). Predicate identical to {@link queryAsOf} for nodes: edge is visible iff
	 * `valid_from <= asOf` AND (`invalidated_at IS NULL` OR `invalidated_at > asOf`) AND
	 * `recorded_at <= asOf`.
	 *
	 * Used by `graph.queryGraphSnapshot` RPC (Wave 1 — Plan 15-02). Wave 3 (Plan 15-04)
	 * projects each EdgeRow into a Cytoscape edge element via the bridge's
	 * `edgeRowToCyElement` projection utility (Pitfall 1 fence — row never mutated).
	 */
	queryEdgesAsOf(t: string): EdgeRow[] {
		const rows = this.db.select().from(edges).where(
			and(
				lte(edges.valid_from, t),
				or(isNull(edges.invalidated_at), gt(edges.invalidated_at, t)),
				lte(edges.recorded_at, t),
			)
		).all();
		return rows.map((r) => ({
			id: r.id,
			kind: r.kind as EdgeKind,
			src_id: r.src_id,
			dst_id: r.dst_id,
			valid_from: r.valid_from,
			invalidated_at: r.invalidated_at,
			recorded_at: r.recorded_at,
			superseded_by: r.superseded_by,
			// Phase 17 Plan 17-04 DEEP-06 phase-B (B1 prerequisite): project repo_id from the
			// SQLite column. Migration 0008 backfilled all pre-Phase-16 rows to 'primary'.
			// Symmetric with NodeRow materialize() extension above.
			repo_id: r.repo_id,
		}));
	}

	/**
	 * Phase 15 Plan 15-02 (DEEP-02). Returns the deduped, sorted-ascending union of every
	 * distinct `valid_from` and `invalidated_at` instant across nodes AND edges. Powers the
	 * Graph Inspector's discrete-step slider (RESEARCH Risk 4) — the webview snaps to these
	 * transition points so every drag step produces a visually-distinct snapshot.
	 *
	 * Result excludes NULL values (`invalidated_at` is nullable on both tables). Single SQL
	 * statement using UNION (DISTINCT by default) — no N+1, no application-side dedup.
	 *
	 * Read-only: no parameters; returns the FULL timeline regardless of asOf — the slider
	 * needs the complete step set, not a filtered subset.
	 */
	queryTimelineTransitions(): string[] {
		// Raw better-sqlite3 — Drizzle's union builder requires re-typing each leg, which
		// is awkward for four-way UNION; raw SQL is shorter and the predicate is a pure
		// read (no mutation surface to drift). $client access pattern mirrors queryByAnchor
		// + queryReferencesEdges + findSuccessor (the existing raw-SQL escape hatch in dao.ts).
		const sqlite = (this.db as unknown as { $client: BetterSqliteHandle }).$client;
		const rows = sqlite.prepare(`
			SELECT DISTINCT valid_from AS t FROM nodes WHERE valid_from IS NOT NULL
			UNION
			SELECT DISTINCT invalidated_at AS t FROM nodes WHERE invalidated_at IS NOT NULL
			UNION
			SELECT DISTINCT valid_from AS t FROM edges WHERE valid_from IS NOT NULL
			UNION
			SELECT DISTINCT invalidated_at AS t FROM edges WHERE invalidated_at IS NOT NULL
			ORDER BY t ASC
		`).all() as Array<{ t: string }>;
		return rows.map((r) => r.t);
	}

	/**
	 * Look up nodes whose payload contains an exact-equality match at a JSON path,
	 * filtered by bitemporal active-set as of `asOf`.
	 *
	 * MANDATE C: This method does EXACT equality only. There is no `queryByAnchorLike`
	 * or fuzzy variant. The CI gate `scripts/ci/refuse-fuzzy-fallback.sh` catches any
	 * import of fuzzy libraries; this method's contract is the structural backstop.
	 *
	 * @param jsonPath e.g. '$.anchor.file', '$.anchor.symbol', '$.anchor.ticket_id'
	 * @param value    The exact string to match
	 * @param asOf     ISO-8601 transaction time
	 */
	/**
	 * Phase 16 Plan 16-02 DEEP-06 phase-A extension: optional `repoId` default-param.
	 * Two-arg callers (all existing call sites) default to repoId='primary' — back-compat
	 * guaranteed since all pre-Phase-16 rows have repo_id='primary' via migration 0008.
	 * Three-arg callers (future cross-repo readers, Phase 17 phase-B) filter to that repo only.
	 */
	queryByAnchor(
		args: { jsonPath: string; value: string },
		asOf: string,
		repoId: string = 'primary',
	): NodeRow[] {
		// drizzle-orm 0.45.2's `drizzle()` factory return type intersects BetterSQLite3Database
		// with `{ $client: Database }` — accessing the underlying handle is the path of least
		// resistance for json_extract over LIKE/LOWER ambiguity. NodePayload type is inferred
		// from the JSON-stored shape; no Zod re-parse needed at the read boundary (DAO trusts
		// what it wrote).
		const sqlite = (this.db as unknown as { $client: BetterSqliteHandle }).$client;
		const stmt = sqlite.prepare(`
			SELECT id, kind, payload, confidence, valid_from, invalidated_at, recorded_at, superseded_by
			FROM nodes
			WHERE json_extract(payload, ?) = ?
			  AND repo_id = ?
			  AND valid_from <= ?
			  AND (invalidated_at IS NULL OR invalidated_at > ?)
			  AND recorded_at <= ?
			ORDER BY valid_from ASC
		`);
		const rows = stmt.all(args.jsonPath, args.value, repoId, asOf, asOf, asOf) as Array<{
			id: string;
			kind: string;
			payload: string;
			confidence: string;
			valid_from: string;
			invalidated_at: string | null;
			recorded_at: string;
			superseded_by: string | null;
		}>;
		return rows.map((r) => ({
			id: r.id,
			kind: r.kind as NodeKind,
			payload: JSON.parse(r.payload) as NodePayload,
			confidence: r.confidence as Confidence,
			valid_from: r.valid_from,
			invalidated_at: r.invalidated_at,
			recorded_at: r.recorded_at,
			superseded_by: r.superseded_by,
			repo_id: 'primary',
		}));
	}

	/**
	 * Return the dst_ids of all active 'references' edges originating at {@link srcId}.
	 * Used by Phase 5 Plan 05-06 promotion gate (canvas-decision-listener) to walk an
	 * Attempt(accepted)'s citation list.
	 */
	queryReferencesEdges(srcId: string): readonly string[] {
		const sqlite = (this.db as unknown as { $client: BetterSqliteHandle }).$client;
		const rows = sqlite.prepare(`
			SELECT dst_id FROM edges
			WHERE src_id = ? AND kind = 'references' AND invalidated_at IS NULL
			ORDER BY recorded_at ASC
		`).all(srcId) as Array<{ dst_id: string }>;
		return rows.map((r) => r.dst_id);
	}

	/**
	 * Find the row that supersedes `nodeId`, by walking the `supersedes` edge.
	 * Returns null if `nodeId` is the current head (or doesn't exist).
	 *
	 * Convention (Phase 2 dao.ts supersede): supersedes edge has src_id=newer, dst_id=older.
	 * We look for an edge with dst_id=nodeId AND kind='supersedes' AND active
	 * (invalidated_at IS NULL), then return the row identified by src_id.
	 *
	 * Used by Plan 03-03 renderReceipt for the "superseded by ->" badge (REC-03).
	 */
	findSuccessor(nodeId: string): NodeRow | null {
		const sqlite = (this.db as unknown as { $client: BetterSqliteHandle }).$client;
		const row = sqlite.prepare(`
			SELECT n.id, n.kind, n.payload, n.confidence, n.valid_from, n.invalidated_at, n.recorded_at, n.superseded_by
			FROM edges e
			JOIN nodes n ON n.id = e.src_id
			WHERE e.dst_id = ? AND e.kind = 'supersedes' AND e.invalidated_at IS NULL
			ORDER BY e.recorded_at ASC
			LIMIT 1
		`).get(nodeId) as {
			id: string; kind: string; payload: string; confidence: string;
			valid_from: string; invalidated_at: string | null; recorded_at: string;
			superseded_by: string | null;
		} | undefined;
		if (!row) {
			return null;
		}
		return {
			id: row.id,
			kind: row.kind as NodeKind,
			payload: JSON.parse(row.payload) as NodePayload,
			confidence: row.confidence as Confidence,
			valid_from: row.valid_from,
			invalidated_at: row.invalidated_at,
			recorded_at: row.recorded_at,
			superseded_by: row.superseded_by,
			repo_id: 'primary',
		};
	}

	/**
	 * Read the provenance row for a node. REC-06: "Why was this done?" drills into the
	 * provenance table and returns the originating source/actor/detail.
	 */
	queryProvenance(nodeId: string): ProvenanceRow | null {
		const sqlite = (this.db as unknown as { $client: BetterSqliteHandle }).$client;
		const row = sqlite.prepare(`
			SELECT node_id, source, actor, recorded_at, detail
			FROM provenance
			WHERE node_id = ?
		`).get(nodeId) as {
			node_id: string; source: string; actor: string; recorded_at: string; detail: string | null;
		} | undefined;
		if (!row) {
			return null;
		}
		return {
			node_id: row.node_id,
			source: row.source,
			actor: row.actor,
			recorded_at: row.recorded_at,
			detail: row.detail ? JSON.parse(row.detail) as Record<string, unknown> : null,
		};
	}

	private materialize(raw: typeof nodes.$inferSelect): NodeRow {
		return {
			id: raw.id,
			kind: raw.kind as NodeKind,
			payload: raw.payload as NodePayload,
			confidence: raw.confidence as Confidence,
			valid_from: raw.valid_from,
			invalidated_at: raw.invalidated_at,
			recorded_at: raw.recorded_at,
			superseded_by: raw.superseded_by,
			// Phase 17 Plan 17-04 DEEP-06 phase-B (B1 prerequisite): project repo_id from the
			// SQLite column. Migration 0008 added repo_id and backfilled all pre-Phase-16 rows to
			// 'primary'. This copy ensures the typed NodeRow shape carries repo_id so the
			// queryGraphSnapshot handler can project it to the wire (Pitfall D defense).
			repo_id: raw.repo_id,
		};
	}
}
