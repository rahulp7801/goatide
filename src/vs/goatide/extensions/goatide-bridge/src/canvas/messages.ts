/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/canvas/messages.ts — Phase 4 (Plan 04-03)
// Zod schemas for the host <-> webview postMessage trust boundary.
//
// Per 04-RESEARCH.md ## Pattern: Canvas State + Wire Schema. Every inbound message is
// validated; webview hijack via malicious extension is the threat model RESEARCH calls out.

import { z } from 'zod';

// -------- Citation shape consumed by the webview --------
//
// Phase 7 Plan 07-05 (DRIFT-02): RenderedCitationSchema gains an optional intent_drift_badge
// field mirroring the kernel-side RenderedCitation. Plan 07-07 renders the badge via
// CitationList.tsx (icon + click-to-modal explanation). The Zod schema is additive — the
// host->webview canvas.show payload remains structurally compatible with pre-Plan-07-05
// callers that don't populate the field.
//
// Phase 14 Plan 14-03 (DEEP-04): IntentDriftBadgeSchema is now a z.discriminatedUnion on
// `kind`. Two variants:
//   - 'priority-mismatch' (Plan 07-05): existing shape unchanged except for the new `kind`
//     discriminator field.
//   - 'historical-conflict' (Plan 14-03): emitted when a cited DecisionNode was superseded
//     on or before the receipt's asOf. Save proceeds normally (Mandate D — informs, does
//     NOT block). CitationList renders the amber `intent-drift-badge--historical-conflict`
//     variant with the superseded date pill.
//
// Atomicity (Pitfall 5): kernel emit-site (kernel/src/drift/intent.ts evaluateIntentDrift
// + evaluateHistoricalConflict) updated in Task 1 of this plan; this schema MUST land in
// the same plan or the webview Zod parse fails the entire canvas.show payload.

const IntentDriftBadgeSchema = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('priority-mismatch'),
		citation_node_id: z.string().length(26),
		session_priority: z.string(),
		cited_priority: z.string(),
		explanation: z.string(),
	}),
	z.object({
		kind: z.literal('historical-conflict'),
		citation_node_id: z.string().length(26),
		superseded_at: z.string(),
		successor_id: z.string().length(26),
		explanation: z.string(),
	}),
]);
export type IntentDriftBadgeForCanvas = z.infer<typeof IntentDriftBadgeSchema>;

const RenderedCitationSchema = z.object({
	node_id: z.string().length(26),
	version: z.string().length(26),
	confidence: z.enum(['Explicit', 'Inferred']),
	edge_path: z.string(),
	snippet: z.string().max(2048),
	body_preview: z.string().max(2048),
	successor_id: z.string().length(26).nullable(),
	intent_drift_badge: IntentDriftBadgeSchema.nullable().optional(),
});
export type RenderedCitationForCanvas = z.infer<typeof RenderedCitationSchema>;

// -------- Phase 7 Plan 07-07 — Drift surface schemas --------
//
// CanvasShowPayload extends additively with three optional drift fields:
//   - drift_findings   (DRIFT-01): pattern violations from runDriftAndLock
//   - compliance_report (DRIFT-04): tri-bucket ripple report from runRippleProgressive
//   - lock_trigger     (DRIFT-03): non-null when an enforcing-section edit fires
//
// Backward-compatible: pre-Plan-07-07 callers (Phase 4 receipt-only flow) omit these
// fields and the webview ignores them gracefully (DriftFindings + ComplianceReport
// components return null on empty/null props).

const DriftFindingSchema = z.object({
	contract_node_id: z.string(),
	contract_anchor_file: z.string(),
	pattern_index: z.number().int().nonnegative(),
	pattern_kind: z.enum(['regex', 'jsonpath', 'forbidden_import']),
	file: z.string(),
	hunk_line: z.number().int().nonnegative(),
	message: z.string(),
});
export type DriftFindingForCanvas = z.infer<typeof DriftFindingSchema>;

const LockTriggerSchema = z.object({
	contract_node_id: z.string(),
	contract_anchor_file: z.string(),
	section_name: z.string(),
	edited_line_range: z.tuple([z.number().int(), z.number().int()]),
	hunk_index: z.number().int().nonnegative(),
});
export type LockTriggerForCanvas = z.infer<typeof LockTriggerSchema>;

const ComplianceRowSchema = z.object({
	node_id: z.string(),
	kind: z.enum(['ConstraintNode', 'DecisionNode', 'ContractNode', 'OpenQuestion', 'Attempt']),
	anchor_file: z.string().optional(),
	edge_path: z.string(),
	hops: z.union([z.literal(1), z.literal(2), z.literal(3)]),
	body_preview: z.string(),
});
export type ComplianceRowForCanvas = z.infer<typeof ComplianceRowSchema>;

const ComplianceReportSchema = z.object({
	contract_node_id: z.string(),
	max_hops: z.union([z.literal(1), z.literal(2), z.literal(3)]),
	definitely_affected: z.array(ComplianceRowSchema),
	potentially_affected: z.array(ComplianceRowSchema),
	truncated: z.boolean(),
	generated_at: z.string(),
});
export type ComplianceReportForCanvas = z.infer<typeof ComplianceReportSchema>;

// -------- Phase 14 Plan 14-02 — DEEP-01 rationale chain --------
//
// The "Why does this exist?" Verification Canvas component renders an ordered list of
// ConstraintNode + DecisionNode entries — the chain that drove the cited file's current
// shape. The chain is fetched lazily on button click; CanvasShowPayload gains three new
// optional fields (rationale_chain + session_priority + session_priority_indicator).
//
// Bitemporal asOf invariant (Pitfall 1): the chain is anchored to the receipt's
// graph_snapshot_tx_time, NEVER to Date.now() at click time. panel.ts handleMessage
// extracts that timestamp from the current payload state when forwarding to the kernel.

export const RationaleChainEntrySchema = z.object({
	node_id: z.string().length(26),
	kind: z.union([z.literal('ConstraintNode'), z.literal('DecisionNode')]),
	body: z.string(),
	valid_from: z.string(),
	invalidated_at: z.string().nullable(),
	successor_id: z.string().length(26).nullable(),
	confidence: z.union([z.literal('Explicit'), z.literal('Inferred')]),
	edge_path: z.string(),
	derived_under_priority: z.string().optional(),
});
export type RationaleChainEntryForCanvas = z.infer<typeof RationaleChainEntrySchema>;

// -------- canvas.show payload --------

const CanvasShowPayloadSchema = z.object({
	change_id: z.string().length(26),
	tier: z.enum(['silent', 'inline', 'modal']),
	destructive: z.boolean(),
	confirmation_phrase: z.string().nullable(),
	file_uri: z.string(),
	language: z.string(),
	original_content: z.string(),
	modified_content: z.string(),
	citations: z.array(RenderedCitationSchema),
	drill_chain: z.array(z.string()),
	// Phase 7 Plan 07-07 additions — all optional for backward compatibility.
	drift_findings: z.array(DriftFindingSchema).optional(),
	compliance_report: ComplianceReportSchema.nullable().optional(),
	lock_trigger: LockTriggerSchema.nullable().optional(),
	// Phase 14 Plan 14-02 (DEEP-01) — populated lazily on "Why does this exist?" button click.
	// Initially absent. panel.ts handleMessage's canvas.requestRationale branch re-posts
	// canvas.show with this field populated; the webview RationaleChain component reads from
	// payload.rationale_chain to decide between the request-button idle state (null) and the
	// rendered-list loaded state (non-null array). Empty array == "no rationale found"
	// (anchor returned zero ConstraintNode/DecisionNode rows).
	rationale_chain: z.array(RationaleChainEntrySchema).nullable().optional(),
	// Phase 14 Plan 14-02 (DEEP-01) — explicit kernel-degraded sentinel for the rationale
	// fetch path. Set by panel.ts handleMessage when kernelClient.isConnected() is false or
	// the RPC throws. Separates degraded-fork rendering (kernel offline) from empty-graph
	// rendering (anchor matched zero rows). Plan 14-02 Task 3a uses this discriminator.
	rationale_error: z.literal('kernel-degraded').nullable().optional(),
	// Phase 14 Plan 14-04 (DEEP-05) — explicit session priority string consumed by the
	// rerank invocation. W4 fix: separate from session_priority_indicator so the rerank
	// path does not have to parse the user-visible indicator label.
	session_priority: z.string().nullable().optional(),
	// Phase 14 Plan 14-04 (DEEP-05) — user-visible label string rendered by the Canvas
	// header indicator. Plan 14-04 Task 2 reads this field directly.
	session_priority_indicator: z.string().nullable().optional(),
	// Phase 14 Plan 14-02 (DEEP-01) — the receipt's bitemporal snapshot timestamp.
	// REQUIRED for the rationale-chain fetch: panel.ts handleMessage passes this verbatim as
	// the asOf parameter to kernel.queryRationaleAt. NEVER Date.now() at click time
	// (Pitfall 1 — REC-03 single-snapshot invariant). When absent the host falls back to
	// the kernel-degraded sentinel rather than guessing a timestamp.
	graph_snapshot_tx_time: z.string().nullable().optional(),
});
export type CanvasShowPayload = z.infer<typeof CanvasShowPayloadSchema>;

// -------- HostToWebview --------

export const HostToWebviewSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('canvas.show'), payload: CanvasShowPayloadSchema }),
	z.object({ type: z.literal('canvas.hide') }),
	z.object({ type: z.literal('kernel.degraded'), payload: z.object({ reason: z.string() }) }),
	// Phase 7 Plan 07-07 — progressive-disclosure compliance report messages.
	z.object({ type: z.literal('compliance_report.partial'), payload: z.object({ report: ComplianceReportSchema }) }),
	z.object({ type: z.literal('compliance_report.full'), payload: z.object({ report: ComplianceReportSchema }) }),
	// Phase 7 Plan 07-07 — record_override response. tier-dispatch.ts validates the note,
	// invokes kernel.recordContractOverride, and forwards the result through panel.ts so the
	// OverrideButton webview component can react to ok/error.
	z.object({
		type: z.literal('record_override.response'),
		payload: z.object({
			ok: z.boolean(),
			attempt_node_id: z.string().optional(),
			error: z.string().optional(),
		}),
	}),
]);
export type HostToWebview = z.infer<typeof HostToWebviewSchema>;

// -------- WebviewToHost --------

export const WebviewToHostSchema = z.discriminatedUnion('type', [
	// canvas.ready — posted by the webview immediately after React mounts. The bridge uses this
	// signal to guard rpc.show(payload) so the canvas.show message is never sent before the
	// webview's window.addEventListener('message', ...) is established. Without this handshake,
	// a freshly-created panel (Panel B in multi-wave ceremonies) can receive rpc.show before
	// React's useEffect sets up the subscriber, silently dropping the payload (the App stays
	// in the null/empty render state).
	z.object({ type: z.literal('canvas.ready') }),
	z.object({
		type: z.literal('canvas.accept'),
		payload: z.object({
			change_id: z.string().length(26),
			accept_latency_ms: z.number().nonnegative(),
		}),
	}),
	z.object({
		type: z.literal('canvas.reject'),
		payload: z.object({ change_id: z.string().length(26) }),
	}),
	z.object({
		type: z.literal('canvas.reject_with_note'),
		payload: z.object({
			change_id: z.string().length(26),
			note: z.string().min(1),
		}),
	}),
	z.object({
		type: z.literal('citation.explain'),
		payload: z.object({ citation_node_id: z.string().length(26) }),
	}),
	// Phase 7 Plan 07-07 — record_override webview message. The OverrideButton webview
	// component posts this when the developer submits a note >=1 char. panel.ts forwards
	// to tier-dispatch.ts (Option A: save-gate-owned override path); tier-dispatch invokes
	// kernel.recordContractOverride and posts back record_override.response.
	z.object({
		type: z.literal('record_override'),
		payload: z.object({
			change_id: z.string().length(26),
			contract_node_id: z.string(),
			section_name: z.string(),
			note: z.string().min(1),
		}),
	}),
	// Phase 7 Plan 07-07 — reveal-line message. DriftFindings click handler posts this so
	// the extension host can open the file at the corresponding line. Implementation lives
	// in panel.ts handleMessage.
	z.object({
		type: z.literal('reveal_line'),
		payload: z.object({
			file: z.string(),
			line: z.number().int().nonnegative(),
		}),
	}),
	// Phase 14 Plan 14-02 (DEEP-01) — "Why does this exist?" button click. The host already
	// has the current payload state from when it last called rpc.show, so this message is
	// payload-less. panel.ts handleMessage extracts the citation seed + the receipt's
	// graph_snapshot_tx_time from its stored lastPayload, calls kernel.queryRationaleAt, and
	// re-posts canvas.show with rationale_chain populated.
	z.object({ type: z.literal('canvas.requestRationale') }),
]);
export type WebviewToHost = z.infer<typeof WebviewToHostSchema>;
