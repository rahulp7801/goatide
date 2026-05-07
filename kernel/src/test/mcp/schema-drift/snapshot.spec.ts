/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/schema-drift/snapshot.spec.ts — Phase 6 Wave-0 refusal stub for MCP-07.
// Plan 06-04 (OAuth + keychain + drift) flips these.

import { describe, it } from 'vitest';

describe('MCP-07: schema-drift snapshot persistence (canonical hash + read/write)', () => {
	it.skip('MCP-07: canonicalHash stable across key reordering (sorted-keys SHA256)', () => {
		throw new Error('Plan 06-04 has not yet implemented canonicalHash (sorted-keys JSON canonicalization + SHA256 hex)');
	});

	it.skip('MCP-07: writeSnapshot creates parent dir + persists provider snapshot to ~/.config/goatide/mcp/schema-snapshots/<provider>.json', () => {
		throw new Error('Plan 06-04 has not yet implemented writeSnapshot (creates ~/.config/goatide/mcp/schema-snapshots/ and atomic-rename writes <provider>.json)');
	});

	it.skip('MCP-07: readSnapshot returns null when file missing', () => {
		throw new Error('Plan 06-04 has not yet implemented readSnapshot null-on-missing semantics (caller decides cold-start vs subsequent-connect)');
	});
});
