/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/schema-drift/detector.spec.ts — Phase 6 Wave-0 refusal stub for MCP-07.
// Plan 06-04 (OAuth + keychain + drift) flips these.

import { describe, it } from 'vitest';

describe('MCP-07: schema-drift detector — first-connect vs subsequent-connect semantics', () => {
	it.skip('MCP-07: first-ever connect: writes snapshot, returns changed=false (Pitfall 5 — no false-flag on cold start)', () => {
		throw new Error('Plan 06-04 has not yet implemented detectDrift cold-start path (snapshot absent -> write + return changed=false; Pitfall 5 prevents false drift on first run)');
	});

	it.skip('MCP-07: identical second connect: returns changed=false', () => {
		throw new Error('Plan 06-04 has not yet implemented detectDrift identical-second-connect path (canonical hashes equal -> changed=false)');
	});

	it.skip('MCP-07: modified second connect: returns changed=true with per-tool was/now hash diff', () => {
		throw new Error('Plan 06-04 has not yet implemented detectDrift modified-second-connect path (returns {changed:true, tools:[{name, was, now}]})');
	});
});
