/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/liveness.spec.ts — Phase 6 Wave-0 refusal stub for MCP-06.
// Plan 06-06 (liveness + UI surfaces + CLI) flips these.

import { describe, it } from 'vitest';

describe('MCP-06: per-provider liveness — extends Phase-5 LivenessState with mcp.<provider> sources', () => {
	it.skip('MCP-06: mcp.<provider> sources extend Phase-5 LivenessState', () => {
		throw new Error('Plan 06-06 has not yet implemented LivenessState extension for mcp.<provider> sources (mirrors Phase-5 source-keyed map)');
	});

	it.skip('MCP-06: mcp.slack stale beyond threshold (default 1h) flags warning', () => {
		throw new Error('Plan 06-06 has not yet implemented mcp.slack stale threshold (default 3_600_000 ms; injected clock for tests)');
	});

	it.skip('MCP-06: liveness reports per-provider state for status-bar consumption', () => {
		throw new Error('Plan 06-06 has not yet implemented harvesterGetLiveness extension to surface mcp.<provider> states (connected/paused_drift/paused_auth/restarting/stale)');
	});
});
