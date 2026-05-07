/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/registry.spec.ts — Phase 6 Wave-0 refusal stub for MCP-02.
// Plan 06-03 (consume-side multiplexer) flips these.

import { describe, it } from 'vitest';

describe('MCP-02: tool registry namespacing and collision rejection', () => {
	it.skip('MCP-02: register namespaces with <provider>__<tool>', () => {
		throw new Error('Plan 06-03 has not yet implemented McpRegistry.register namespacing (<provider>__<tool> derived name)');
	});

	it.skip('MCP-02: register throws collision error on duplicate fully-namespaced name', () => {
		throw new Error('Plan 06-03 has not yet implemented McpRegistry.register collision detection (same provider+originalName -> throw)');
	});

	it.skip('MCP-02: cross-provider tool name does NOT collide (github__issue_read vs slack__issue_read)', () => {
		throw new Error('Plan 06-03 has not yet implemented namespace separator distinguishing cross-provider name reuse');
	});

	it.skip('MCP-02: register validates provider name against PROVIDER_RE pattern', () => {
		throw new Error('Plan 06-03 has not yet implemented PROVIDER_RE validation (e.g. /^[a-z][a-z0-9_]*$/) to refuse stray characters in provider names');
	});
});
