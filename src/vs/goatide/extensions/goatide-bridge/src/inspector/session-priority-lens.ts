/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/inspector/session-priority-lens.ts —
// Phase 14 Plan 14-01 (Wave-0) DEEP-05 stub.
//
// Wave-0 contract: this module ships as a throw-on-call stub. Plan 14-04 lands the v1
// implementation that reranks citations by drift-bearing badge (priority-mismatch first,
// then historical-conflict, then plain), tie-stable, and emits the header indicator.
//
// Mandate B (DEEP-05): the lens MUST NOT mutate kernel state. The `_client` parameter is
// typed as ReadonlyKernelClient — that type's surface is fenced by
// scripts/ci/refuse-deep05-write.sh against the four banned write-RPC method names (see
// the gate script for the canonical token list). The `_client` argument is reserved for
// future read-only enrichment; v1 does not consult it.

import type { ReadonlyKernelClient } from './ReadonlyKernelClient.js';
import type { RenderedCitationForCanvas, DriftFindingForCanvas } from '../canvas/messages.js';

/**
 * Rerank the citations on a CanvasShowPayload by drift-bearing badge, preserving tie
 * stability. Returns a NEW citations array (Mandate B: the input is not mutated). The
 * header indicator string is emitted unconditionally — Plan 14-04 wires it into the
 * Canvas header element keyed on `data-testid="canvas-header-session-priority"`.
 *
 * Stub at Wave-0: throws. Plan 14-04 flips the throw into the v1 implementation.
 *
 * @param args.citations         — readonly citation array from the rendered receipt.
 * @param args.findings          — readonly drift findings (passed through unchanged in v1).
 * @param args.sessionPriority   — current session priority (e.g. 'Speed-First').
 * @param args._client           — optional read-only kernel client; reserved for future use.
 *
 * @returns `citations` (reranked, new array), `findings` (untouched), `indicator` string.
 */
export function rerankBySessionPriority(args: {
	readonly citations: readonly RenderedCitationForCanvas[];
	readonly findings: readonly DriftFindingForCanvas[];
	readonly sessionPriority: string;
	readonly _client?: ReadonlyKernelClient;
}): {
	readonly citations: readonly RenderedCitationForCanvas[];
	readonly findings: readonly DriftFindingForCanvas[];
	readonly indicator: string;
} {
	void args;
	throw new Error('DEEP-05 not yet implemented — Plan 14-04 must implement rerankBySessionPriority');
}
