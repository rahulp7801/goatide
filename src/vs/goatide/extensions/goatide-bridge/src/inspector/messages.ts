/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/inspector/messages.ts —
// Phase 15 Plan 15-01 (Wave-0 — DEEP-02 Graph Inspector wire schemas).
//
// Host <-> webview wire shapes for the bitemporal Graph Inspector. Wave-0 ships the minimal
// pair of placeholder variants that the panel + tests can compile against:
//   - inspector.ready          (webview -> host)  webview React mount complete
//   - inspector.error          (host -> webview)  show an inline error string
//
// Wave-2 (Plan 15-03) extends both unions:
//   - inspector.show           (host -> webview)  initial snapshot payload
//   - inspector.requestSnapshot (webview -> host)  slider drag -> new asOf snapshot
//
// Wave-3 (Plan 15-04) may add `inspector.requestTimeline` etc. The discriminator field
// name is `type` — mirrors `canvas/messages.ts` HostToWebviewSchema / WebviewToHostSchema
// (Phase 4 precedent, verified).

import { z } from 'zod';

export const InspectorWebviewToHostSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('inspector.ready') }),
]);

export const InspectorHostToWebviewSchema = z.discriminatedUnion('type', [
	z.object({ type: z.literal('inspector.error'), reason: z.string() }),
]);

export type InspectorWebviewToHost = z.infer<typeof InspectorWebviewToHostSchema>;
export type InspectorHostToWebview = z.infer<typeof InspectorHostToWebviewSchema>;
