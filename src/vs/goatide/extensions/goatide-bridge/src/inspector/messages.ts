/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/inspector/messages.ts —
// Phase 15 Plan 15-03 (Wave-2 — DEEP-02 host wiring extended wire schemas).
//
// Host <-> webview wire shapes for the bitemporal Graph Inspector. Wave-0 (Plan 15-01)
// shipped the minimal pair of placeholder variants; Wave-2 (this plan) extends both unions
// with the snapshot wire-shape:
//   - inspector.ready             (webview -> host)  webview React mount complete; host
//                                                    replies with the initial inspector.show
//   - inspector.requestSnapshot   (webview -> host)  slider drag -> new asOf snapshot
//   - inspector.show              (host -> webview)  snapshot payload (nodes + edges +
//                                                    truncated + optional transitions[])
//   - inspector.error             (host -> webview)  show an inline error string
//
// Mandate B fence: schema field names + comments MUST NOT mention any of the four
// banned write-RPC token identifiers — see scripts/ci/refuse-deep05-write.sh BANNED array
// for the canonical list. The inspector wire is read-only by construction; the gate script
// enforces structurally.
//
// Pitfall 1 carry (REC-03 single-snapshot invariant): the host NEVER substitutes
// new Date().toISOString() for an inbound asOf — the slider thumb position drives the asOf
// verbatim. Only the initial inspector.ready handler may compute an asOf for an empty graph
// (transitions[] length === 0); see panel.ts handleMessage.

import { z } from 'zod';

// The 5 canonical kernel NODE_KINDS — pinned by Phase 15 Plan 15-01 RESEARCH Risk 1.
// "Superseded" is a visual modifier (invalidated_at !== null), NOT its own kind.
const NodeKindSchema = z.enum(['ConstraintNode', 'DecisionNode', 'ContractNode', 'OpenQuestion', 'Attempt']);

const InspectorNodeSnapshotSchema = z.object({
	node_id: z.string(),
	kind: NodeKindSchema,
	label: z.string(),
	valid_from: z.string(),
	invalidated_at: z.string().nullable(),
	/** Phase 17 Plan 17-04 DEEP-06 phase-B — Pitfall D defense. Propagated from kernel wire shape. Default 'primary' for all pre-Phase-16 rows. */
	repo_id: z.string(),
});

const InspectorEdgeSnapshotSchema = z.object({
	edge_id: z.string(),
	kind: z.string(),
	src_id: z.string(),
	dst_id: z.string(),
	valid_from: z.string(),
	invalidated_at: z.string().nullable(),
	/** Phase 17 Plan 17-04 DEEP-06 phase-B — Pitfall D defense. Propagated from kernel wire shape. Default 'primary' for all pre-Phase-16 rows. */
	repo_id: z.string(),
});

export const InspectorWebviewToHostSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('inspector.ready') }),
	z.object({ type: z.literal('inspector.requestSnapshot'), asOf: z.string() }),
]);

/**
 * Phase 17 Plan 17-04 DEEP-06 phase-B — serialized WorkspaceRepo shape for the
 * cross-repo inspector.show payload. Mirrors WorkspaceRepo from workspace-repos.ts
 * but flattened to a JSON-safe shape (vscode.WorkspaceFolder.uri serialized as string).
 *
 * Mandate B fence: schema field names MUST NOT mention any of the four banned
 * write-RPC token identifiers — see scripts/ci/refuse-deep05-write.sh BANNED array.
 */
const SerializedWorkspaceRepoSchema = z.object({
	folder_uri: z.string(),
	// Phase 21 XREPO-03 (Open Decision Sec.11) -- readable folder name from vscode.WorkspaceFolder.name.
	folder_name: z.string(),
	repo_id: z.string(),
	remote_url: z.string().nullable(),
});

export const InspectorHostToWebviewSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('inspector.error'), reason: z.string() }),
	z.object({
		type: z.literal('inspector.show'),
		asOf: z.string(),
		nodes: z.array(InspectorNodeSnapshotSchema),
		edges: z.array(InspectorEdgeSnapshotSchema),
		truncated: z.boolean(),
		// Only present on the initial inspector.show (response to inspector.ready). Slider-driven
		// inspector.requestSnapshot responses omit this field; the webview keeps its previously
		// rendered transitions[] array.
		transitions: z.array(z.string()).optional(),
		// Phase 17 Plan 17-04 DEEP-06 phase-B — cross-repo activation fields. Optional: present
		// only when getOrCreateForCrossRepo() triggers the initial show. Absent for single-repo
		// inspector sessions. Pitfall 2 avoidance: cross-repo distinction is a flag on the show
		// payload, NOT a separate panel class or VIEW_TYPE.
		cross_repo_mode: z.boolean().optional(),
		workspace_repos: z.array(SerializedWorkspaceRepoSchema).optional(),
	}),
]);

export type InspectorWebviewToHost = z.infer<typeof InspectorWebviewToHostSchema>;
export type InspectorHostToWebview = z.infer<typeof InspectorHostToWebviewSchema>;
