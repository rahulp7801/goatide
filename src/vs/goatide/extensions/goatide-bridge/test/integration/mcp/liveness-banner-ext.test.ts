/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/test/integration/mcp/liveness-banner-ext.test.ts
//
// Phase 6 Wave-0 mocha refusal stub for MCP-06 (bridge half). Plan 06-06 flips these from
// skip -> real assertions when the LivenessBanner is extended to surface mcp.<provider>
// sources from the kernel's extended LivenessState. Reuses Phase-4 vscode-stub.ts for the
// status-bar + commands API surface.

import { describe, it } from 'mocha';

describe('MCP-06: liveness banner extension surfaces mcp.<provider> sources', () => {
	it.skip('MCP-06: banner picks up mcp.<provider> sources from extended LivenessState', async () => {
		throw new Error('Plan 06-06 has not yet implemented LivenessBanner extension for mcp.<provider> source keys');
	});

	it.skip('MCP-06: click target lists stale providers including MCP-prefixed ones', async () => {
		throw new Error('Plan 06-06 has not yet implemented quickPick stale-source listing including mcp.<provider> entries');
	});

	it.skip('MCP-06: status-bar background transitions to errorBackground on stale-MCP-provider', async () => {
		throw new Error('Plan 06-06 has not yet implemented status-bar errorBackground transition when any mcp.<provider> is stale beyond threshold');
	});
});
