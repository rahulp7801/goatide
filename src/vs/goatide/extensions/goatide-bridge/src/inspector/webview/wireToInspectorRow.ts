/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/inspector/webview/wireToInspectorRow.ts —
// Phase 15 Plan 15-04 (Wave 3 — Issue #1 fix from gsd-plan-checker).
//
// Wire-shape ↔ InspectorRow translation adapter. Plan 15-03 messages.ts declares the
// inspector.show payload using kernel wire-shape field names (node_id / edge_id /
// src_id / dst_id per SerializedNodeSnapshot / SerializedEdgeSnapshot from Plan
// 15-02). The Wave-0 InspectorNodeRow / InspectorEdgeRow types (Plan 15-01) use the
// post-projection `id` shape — matching what Cytoscape's element shape expects
// post-projection (kernelRowToCyElement maps `row.id` → `data.id`).
//
// This adapter mediates at the App.tsx inspector.show dispatch boundary. Pure
// functions — input never mutated (mirror kernelRowToCyElement mutation-invariant
// discipline). Keeps the kernel wire-shape contract intact (Plan 15-03 unchanged)
// and keeps InspectorRow types pure within the webview boundary.
//
// Mandate B isolation: the Wire* interfaces below duplicate the Plan 15-02
// SerializedNodeSnapshot / SerializedEdgeSnapshot field names verbatim, so the
// webview never imports from kernel/.

import type { InspectorNodeRow } from '../kernelRowToCyElement.js';
import type { InspectorEdgeRow } from '../edgeRowToCyElement.js';

/**
 * Mirror of kernel SerializedNodeSnapshot — wire shape that arrives over the
 * inspector.show message. Field names match `kernel/src/rpc/methods.ts`
 * QueryGraphSnapshotResult.nodes byte-for-byte; the 5 canonical kernel kinds are
 * pinned here too (RESEARCH Risk 1 — Phase 15 uses the canonical kinds verbatim,
 * not the additional ROADMAP-narrative names which do not exist in the kernel).
 *
 * Phase 17 Plan 17-04 DEEP-06 phase-B: repo_id field added (Pitfall D defense).
 */
export interface WireNodeSnapshot {
	readonly node_id: string;
	readonly kind: 'ConstraintNode' | 'DecisionNode' | 'ContractNode' | 'OpenQuestion' | 'Attempt';
	readonly label: string;
	readonly valid_from: string;
	readonly invalidated_at: string | null;
	/** Phase 17 Plan 17-04 DEEP-06 phase-B — propagated from kernel wire shape. Default 'primary' for all pre-Phase-16 rows. */
	readonly repo_id: string;
}

/** Mirror of kernel SerializedEdgeSnapshot — wire shape over inspector.show. Phase 17 Plan 17-04 DEEP-06 phase-B: repo_id field added. */
export interface WireEdgeSnapshot {
	readonly edge_id: string;
	readonly kind: string;
	readonly src_id: string;
	readonly dst_id: string;
	readonly valid_from: string;
	readonly invalidated_at: string | null;
	/** Phase 17 Plan 17-04 DEEP-06 phase-B — propagated from kernel wire shape. Default 'primary' for all pre-Phase-16 rows. */
	readonly repo_id: string;
}

/**
 * Translate a wire-shape node snapshot to the InspectorNodeRow shape. Pure — `wire`
 * is never mutated. Explicit per-field copy keeps the Pitfall 1 mutation invariant
 * trivially auditable in the source text (no object spread / no Object.assign).
 *
 * Phase 17 Plan 17-04 DEEP-06 phase-B: threads repo_id from wire to InspectorNodeRow
 * (Pitfall D defense — repo_id was carried from SQLite through the kernel wire, now
 * propagated into the webview's row shape for cross-repo edge detection).
 */
export function wireToInspectorNodeRow(wire: WireNodeSnapshot): InspectorNodeRow {
	return {
		id: wire.node_id,
		kind: wire.kind,
		label: wire.label,
		valid_from: wire.valid_from,
		invalidated_at: wire.invalidated_at,
		repo_id: wire.repo_id,
	};
}

/**
 * Translate a wire-shape edge snapshot to the InspectorEdgeRow shape. Pure — `wire`
 * is never mutated. The `src_id` / `dst_id` field names are preserved verbatim;
 * downstream `edgeRowToCyElement` renames them to Cytoscape's `source` / `target`
 * convention at the projection boundary.
 *
 * Phase 17 Plan 17-04 DEEP-06 phase-B: threads repo_id from wire to InspectorEdgeRow.
 */
export function wireToInspectorEdgeRow(wire: WireEdgeSnapshot): InspectorEdgeRow {
	return {
		id: wire.edge_id,
		kind: wire.kind,
		src_id: wire.src_id,
		dst_id: wire.dst_id,
		valid_from: wire.valid_from,
		invalidated_at: wire.invalidated_at,
		repo_id: wire.repo_id,
	};
}
