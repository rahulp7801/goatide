/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/clients/stdio-client.spec.ts — Phase 6 Wave-0 refusal stub for MCP-06.
// Plan 06-03 (consume-side multiplexer) flips these.

import { describe, it } from 'vitest';

describe('MCP-06: stdio Client lifecycle, env merge, and onerror handling', () => {
	it.skip('MCP-06: client.onerror handler fires on transport error and pool transitions state to restarting', () => {
		throw new Error('Plan 06-03 has not yet implemented Client.onerror wiring -> pool state transition to restarting');
	});

	it.skip('MCP-06: env merge spreads process.env first then adapter env (Pitfall 2 — PATH inheritance)', () => {
		throw new Error('Plan 06-03 has not yet implemented spawnProvider env merge (process.env first then adapter env; preserves PATH)');
	});

	it.skip('MCP-06: process.env mutation by adapter rejected (Pitfall 8 — CI grep enforced)', () => {
		throw new Error('Plan 06-03 has not yet implemented adapter purity check (no process.env writes; CI grep enforces)');
	});
});
