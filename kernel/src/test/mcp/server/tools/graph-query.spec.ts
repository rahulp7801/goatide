/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/server/tools/graph-query.spec.ts — Phase 6 Wave-0 refusal stub for MCP-09 + MCP-10.
// Plan 06-02 (expose-side server) flips these.

import { describe, it } from 'vitest';

describe('MCP-09 + MCP-10: graph.query tool exposes Phase-3 queryGraph via MCP', () => {
	it.skip('MCP-09 + MCP-10: graph.query routes to existing kernel.queryGraph code path; response shape matches Phase-3 QueryGraphResult', () => {
		throw new Error('Plan 06-02 has not yet implemented graph.query MCP tool wrapping kernel.queryGraph (Phase-3 QueryGraphResult shape preserved)');
	});

	it.skip('MCP-10: unresolvable anchor returns empty {nodes:[], paths:[]} (Mandate-C — no fuzzy fallback)', () => {
		throw new Error('Plan 06-02 has not yet implemented Mandate-C empty-result behavior for unresolvable anchors (no did-you-mean, no embedding fallback)');
	});

	it.skip('MCP-09: depth-cap and at-time parameters honored', () => {
		throw new Error('Plan 06-02 has not yet implemented depth-cap + at-time bitemporal filter passthrough on graph.query');
	});
});
