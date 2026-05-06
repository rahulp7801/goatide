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

const RenderedCitationSchema = z.object({
	node_id: z.string().length(26),
	version: z.string().length(26),
	confidence: z.enum(['Explicit', 'Inferred']),
	edge_path: z.string(),
	snippet: z.string().max(2048),
	body_preview: z.string().max(2048),
	successor_id: z.string().length(26).nullable(),
});
export type RenderedCitationForCanvas = z.infer<typeof RenderedCitationSchema>;

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
});
export type CanvasShowPayload = z.infer<typeof CanvasShowPayloadSchema>;

// -------- HostToWebview --------

export const HostToWebviewSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('canvas.show'), payload: CanvasShowPayloadSchema }),
	z.object({ type: z.literal('canvas.hide') }),
	z.object({ type: z.literal('kernel.degraded'), payload: z.object({ reason: z.string() }) }),
]);
export type HostToWebview = z.infer<typeof HostToWebviewSchema>;

// -------- WebviewToHost --------

export const WebviewToHostSchema = z.discriminatedUnion('type', [
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
]);
export type WebviewToHost = z.infer<typeof WebviewToHostSchema>;
