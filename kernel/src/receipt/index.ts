/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/receipt/index.ts — Phase 3 public surface for the receipt subsystem.
//
// Wave 3 RPC (Plan 03-04), Canvas (Phase 4), and any future MCP client (Phase 6) imports
// from THIS file, never from `./builder.js` / `./render.js` / `./dao.js` / `./citation.js`
// directly. Mirrors the kernel/src/graph/index.js pattern.

export { CitationSchema, type Citation } from './citation.js';
export { ReceiptDAO } from './dao.js';
export { type ReasoningReceipt } from './builder.js';
// buildReceipt + ReceiptRefusalError + BuildReceiptInput land in Task 2.
// renderReceipt + explainCitation + RenderedCitation/RenderedReceipt/ProvenanceTrail land in Task 3.
