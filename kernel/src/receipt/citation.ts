/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/receipt/citation.ts — Phase 3 (Plan 03-03) citation tuple shape.
//
// Per 03-RESEARCH.md ## Pattern: Citation Tuple Shape and REC-02. Each citation is a tuple,
// NEVER a free-text summary. The version field is intentionally redundant with node_id —
// supersession creates a NEW row with a NEW ULID, so the row's id IS the version. Explicit
// `version` makes this contract obvious to renderers and to MCP clients (Phase 6) who may
// have downstream code that keys on version separately.

import { z } from 'zod';

export const CitationSchema = z.object({
	node_id: z.string().length(26, 'node_id must be a 26-char ULID'),
	version: z.string().length(26, 'version must be a 26-char ULID'),
	confidence: z.enum(['Explicit', 'Inferred']),
	edge_path: z.string(),
	snippet: z.string().max(280, 'snippet must be <=280 chars (no free-text summarization)'),
});

export type Citation = z.infer<typeof CitationSchema>;
