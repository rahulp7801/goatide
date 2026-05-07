/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/registry.spec.ts — Phase 6 (Plan 06-03) MCP-02 namespacing + collision.

import { describe, expect, it } from 'vitest';
import { ToolRegistry, SEPARATOR } from '../../mcp/registry.js';

function makeReg() {
	return new ToolRegistry();
}

const noopHandler = async () => undefined;
const noopSchema = { type: 'object' as const, properties: {} };

describe('MCP-02: tool registry namespacing and collision rejection', () => {
	it('MCP-02: register namespaces with <provider>__<tool>', () => {
		const reg = makeReg();
		const namespaced = reg.register({ provider: 'github', originalName: 'issue_read', inputSchema: noopSchema, handler: noopHandler });
		const stored = reg.get(namespaced);
		expect({
			separator: SEPARATOR,
			namespaced,
			stored: stored ? { provider: stored.provider, originalName: stored.originalName } : null,
			listAll: reg.listAll(),
		}).toEqual({
			separator: '__',
			namespaced: 'github__issue_read',
			stored: { provider: 'github', originalName: 'issue_read' },
			listAll: [{ name: 'github__issue_read', provider: 'github' }],
		});
	});

	it('MCP-02: register throws collision error on duplicate fully-namespaced name', () => {
		const reg = makeReg();
		reg.register({ provider: 'github', originalName: 'issue_read', inputSchema: noopSchema, handler: noopHandler });
		expect(() => reg.register({ provider: 'github', originalName: 'issue_read', inputSchema: noopSchema, handler: noopHandler }))
			.toThrowError('ToolRegistry: tool name collision: github__issue_read');
	});

	it('MCP-02: cross-provider tool name does NOT collide (github__issue_read vs slack__issue_read)', () => {
		const reg = makeReg();
		const a = reg.register({ provider: 'github', originalName: 'issue_read', inputSchema: noopSchema, handler: noopHandler });
		const b = reg.register({ provider: 'slack', originalName: 'issue_read', inputSchema: noopSchema, handler: noopHandler });
		expect({
			a,
			b,
			listAll: reg.listAll().map(e => e.name).sort(),
			byGithub: reg.listByProvider('github').map(r => r.originalName),
			bySlack: reg.listByProvider('slack').map(r => r.originalName),
		}).toEqual({
			a: 'github__issue_read',
			b: 'slack__issue_read',
			listAll: ['github__issue_read', 'slack__issue_read'],
			byGithub: ['issue_read'],
			bySlack: ['issue_read'],
		});
	});

	it('MCP-02: register validates provider name against PROVIDER_RE pattern', () => {
		const reg = makeReg();
		const bad = ['GitHub', 'gh-mcp', 'mcp gateway', '', '1leading', 'a'.repeat(33)];
		const errors = bad.map(provider => {
			try {
				// deliberately cast: PROVIDER_RE rejection happens at the runtime check, before TS sees the literal-union restriction.
				reg.register({ provider: provider as unknown as 'github', originalName: 'tool', inputSchema: noopSchema, handler: noopHandler });
				return null;
			} catch (err) {
				return (err as Error).message.startsWith('ToolRegistry: provider name violates pattern');
			}
		});
		expect(errors).toEqual([true, true, true, true, true, true]);
	});
});
