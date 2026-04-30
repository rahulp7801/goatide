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
}

export interface NodeRow {
	id: string;
	kind: NodeKind;
	payload: NodePayload;
	confidence: Confidence;
	valid_from: string;
	invalidated_at: string | null;
	recorded_at: string;
	superseded_by: string | null;
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

		// drizzle-orm 0.45.2: db.transaction(fn) executes the function synchronously and
		// returns its return value (NOT a callable to invoke separately — that's the raw
		// better-sqlite3 API). Plan-output question resolved: trailing `()` would error
		// with "Type 'void' has no call signatures".
		this.db.transaction((tx) => {
			tx.insert(nodes).values({
				id,
				kind: payload.kind,
				payload,
				confidence: 'Explicit',          // Phase 2 only writes Explicit (RESEARCH user_constraints)
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
	supersede(oldId: string, newPayload: NodePayload): { newId: string } {
		const payload = NodePayloadSchema.parse(newPayload);
		const newId = ulid();
		const ts = nowIso();

		this.db.transaction((tx) => {
			// 1. Invalidate the old row, but ONLY if it is currently active.
			//    The `isNull(invalidated_at)` predicate is the idempotency guard:
			//    re-superseding an already-superseded id touches zero rows and we throw.
			const updateResult = tx.update(nodes)
				.set({ invalidated_at: ts, superseded_by: newId })
				.where(and(eq(nodes.id, oldId), isNull(nodes.invalidated_at)))
				.run();
			if (updateResult.changes !== 1) {
				throw new Error(`supersede: node ${oldId} not found or already superseded`);
			}

			// 2. Insert the new row at the same instant.
			tx.insert(nodes).values({
				id: newId,
				kind: payload.kind,
				payload,
				confidence: 'Explicit',
				valid_from: ts,
				recorded_at: ts,
			}).run();

			// 3. Write the supersedes edge atomically.
			tx.insert(edges).values({
				id: ulid(),
				kind: 'supersedes' satisfies EdgeKind,
				src_id: newId,
				dst_id: oldId,
				valid_from: ts,
				recorded_at: ts,
			}).run();
		});

		return { newId };
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
	queryByAnchor(args: { jsonPath: string; value: string }, asOf: string): NodeRow[] {
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
			  AND valid_from <= ?
			  AND (invalidated_at IS NULL OR invalidated_at > ?)
			  AND recorded_at <= ?
			ORDER BY valid_from ASC
		`);
		const rows = stmt.all(args.jsonPath, args.value, asOf, asOf, asOf) as Array<{
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
		}));
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
		};
	}
}
