/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/canvas/types.ts — Phase 4 (Plan 04-02) Canvas type contracts.
//
// Pure Zod schemas + inferred TypeScript types. No IO, no VS Code APIs. The bridge (Plan 04-04)
// imports CanvasDecisionSchema to validate webview→host postMessage payloads; the classifier
// (./classifier.ts) consumes TierClassifierInputs.
//
// Layering: this module sits in kernel/src/canvas/ — graph + receipt may NOT import from here
// (canvas is BELOW rpc, ABOVE graph/receipt — same as the rpc/ tree). graph/payloads.ts duplicates
// the 'silent'|'inline'|'modal' enum literal (3 lines) to avoid an upward-facing import; the
// duplication is cross-checked by kernel/src/test/canvas/attempt-payload.spec.ts.

import { z } from 'zod';
import type { ReasoningReceipt } from '../receipt/index.js';
import type { NodeKind } from '../graph/schema/nodes.js';

// -------- CanvasTier --------

export const CanvasTierSchema = z.enum(['silent', 'inline', 'modal']);
export type CanvasTier = z.infer<typeof CanvasTierSchema>;

// -------- CanvasDecision (webview → host post-modal outcome) --------

const AcceptDecision = z.object({
	kind: z.literal('accept'),
	accept_latency_ms: z.number().nonnegative(),   // CANV-09 telemetry
});
const RejectDecision = z.object({
	kind: z.literal('reject'),
});
const RejectWithNoteDecision = z.object({
	kind: z.literal('reject_with_note'),
	note: z.string().min(1, 'Reject-with-Note requires a non-empty note (CANV-03)'),
});

export const CanvasDecisionSchema = z.discriminatedUnion('kind', [
	AcceptDecision,
	RejectDecision,
	RejectWithNoteDecision,
]);
export type CanvasDecision = z.infer<typeof CanvasDecisionSchema>;

// -------- TierClassifierInputs --------

/**
 * One element of the optional citationDetails array. The bridge (Plan 04-04) hydrates these by
 * calling dao.queryById(citation.node_id) on each citation BEFORE invoking classifyTier — so the
 * classifier itself stays pure (no DAO dependency).
 *
 * If the caller omits citationDetails, the high-impact-ContractNode signal is treated as false;
 * the soft signals (Explicit-promoted / Inferred-unpromoted / empty) still apply.
 */
export interface CitationDetail {
	node_id: string;
	kind: NodeKind;
	contract_path?: string;
}

export interface TierClassifierInputs {
	receipt: ReasoningReceipt;
	diff: string;
	anchorPath?: string;
	contractAllowlist?: readonly string[];
	citationDetails?: readonly CitationDetail[];
}
