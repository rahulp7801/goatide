/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/server/tools/graph-subscribe.spec.ts — Phase 6 Wave-0 refusal stub for MCP-09.
// Plan 06-02 (expose-side server) flips this.

import { describe, it } from 'vitest';

describe('MCP-09: graph.subscribe tool stub returns method_not_supported', () => {
	it.skip('MCP-09: graph.subscribe stub returns method_not_supported with structuredContent {error: method_not_supported, retryable: false} (Pitfall 11 — distinct permanent vs transient)', () => {
		throw new Error('Plan 06-02 has not yet implemented graph.subscribe stub (returns isError:true + structuredContent.error=method_not_supported + retryable:false; Pitfall 11 distinguishes permanent from transient)');
	});
});
