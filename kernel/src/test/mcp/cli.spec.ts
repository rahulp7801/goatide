/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/cli.spec.ts — Phase 6 Wave-0 refusal stub for MCP-03 + MCP-06.
// Plan 06-06 (liveness + UI surfaces + CLI) flips these.

import { describe, it } from 'vitest';

describe('MCP-03 + MCP-06: goatide-cli mcp subcommands (configure + status)', () => {
	it.skip('MCP-03: goatide-cli mcp configure --provider slack writes token to keychain via keytar', () => {
		throw new Error('Plan 06-06 has not yet implemented goatide-cli mcp configure subcommand (commander.js parser + keytar.setPassword to goatide.mcp.<provider>.access_token)');
	});

	it.skip('MCP-06: goatide-cli mcp status prints per-provider state (connected/paused_drift/paused_auth/restarting)', () => {
		throw new Error('Plan 06-06 has not yet implemented goatide-cli mcp status subcommand (calls daemon harvesterGetLiveness extension; prints table)');
	});
});
