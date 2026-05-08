/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/integration/sc5-tool-name-collision.spec.ts — Phase 6 Plan 06-07.
//
// ROADMAP SC #5 — "Developer attempts to register a tool with a colliding name (e.g., two
// providers both expose `issue_read`) and registration is rejected; tools are namespaced as
// github__issue_read, slack__thread_fetch, etc."
//
// This spec exercises the production ToolRegistry directly (kernel/src/mcp/registry.ts) with
// the literal SEPARATOR='__' contract + PROVIDER_RE validation + collision-throw semantics
// that Plan 06-03 shipped. Three layers of evidence:
//
//   1. NAMESPACING — register({provider:'github', originalName:'issue_read'}) returns the
//      string 'github__issue_read'.
//   2. COLLISION REJECTION — second register with the same (provider, originalName) pair
//      throws with a stable error message.
//   3. CROSS-PROVIDER DISTINCT — register({provider:'slack', originalName:'issue_read'}) is
//      independent of github__issue_read; both coexist.
//
// We additionally verify the refuse-mcp-collision.sh CI gate exits 0 against the actual
// production code (currently no register() calls in registry.ts itself; the gate scans for
// duplicate <provider>__<tool> name pairs in any future register() call sites).

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ToolRegistry, SEPARATOR } from '../../../mcp/registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Repo root is 5 levels above kernel/src/test/mcp/integration/ (kernel/src/test/mcp/integration -> kernel/src/test/mcp -> kernel/src/test -> kernel/src -> kernel -> repo-root).
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..');

const noopHandler = async () => undefined;
const noopSchema = { type: 'object' as const, properties: {} };

describe('ROADMAP SC #5 — tool-name namespacing + collision rejection + CI gate', () => {
	it('namespacing: register({provider, originalName}) returns "<provider>__<originalName>"', () => {
		const reg = new ToolRegistry();
		const namespaced = reg.register({
			provider: 'github',
			originalName: 'issue_read',
			inputSchema: noopSchema,
			handler: noopHandler,
		});
		expect({ separator: SEPARATOR, namespaced, count: reg.listAll().length }).toEqual({
			separator: '__',
			namespaced: 'github__issue_read',
			count: 1,
		});
	});

	it('collision: re-registering same (provider, originalName) throws with the literal collision message', () => {
		const reg = new ToolRegistry();
		reg.register({
			provider: 'github',
			originalName: 'issue_read',
			inputSchema: noopSchema,
			handler: noopHandler,
		});
		expect(() =>
			reg.register({
				provider: 'github',
				originalName: 'issue_read',
				inputSchema: noopSchema,
				handler: noopHandler,
			}),
		).toThrowError('ToolRegistry: tool name collision: github__issue_read');
	});

	it('cross-provider distinct: github__issue_read and slack__issue_read coexist', () => {
		const reg = new ToolRegistry();
		const a = reg.register({
			provider: 'github',
			originalName: 'issue_read',
			inputSchema: noopSchema,
			handler: noopHandler,
		});
		const b = reg.register({
			provider: 'slack',
			originalName: 'issue_read',
			inputSchema: noopSchema,
			handler: noopHandler,
		});
		expect({
			a,
			b,
			byGithub: reg.listByProvider('github').map((r) => r.originalName),
			bySlack: reg.listByProvider('slack').map((r) => r.originalName),
			allNames: reg.listAll().map((e) => e.name).sort(),
		}).toEqual({
			a: 'github__issue_read',
			b: 'slack__issue_read',
			byGithub: ['issue_read'],
			bySlack: ['issue_read'],
			allNames: ['github__issue_read', 'slack__issue_read'],
		});
	});

	it('refuse-mcp-collision.sh CI gate exits 0 against the production tree (registry.ts source-of-truth)', () => {
		const result = spawnSync('bash', ['scripts/ci/refuse-mcp-collision.sh'], {
			cwd: REPO_ROOT,
			encoding: 'utf8',
		});
		expect({
			status: result.status,
			stderr: result.stderr.trim(),
			stdoutContainsOk: result.stdout.includes('ok'),
		}).toEqual({
			status: 0,
			stderr: '',
			stdoutContainsOk: true,
		});
	});

	it('full SC #5 contract: namespacing prevents cross-provider collisions; same-(provider, name) rejected', () => {
		// One snapshot-style assertion bundling the SC #5 contract.
		const reg = new ToolRegistry();
		reg.register({ provider: 'github', originalName: 'issue_read', inputSchema: noopSchema, handler: noopHandler });
		reg.register({ provider: 'slack', originalName: 'thread_fetch', inputSchema: noopSchema, handler: noopHandler });
		reg.register({ provider: 'linear', originalName: 'ticket_read', inputSchema: noopSchema, handler: noopHandler });
		reg.register({ provider: 'jira', originalName: 'ticket_read', inputSchema: noopSchema, handler: noopHandler });

		let collisionMessage: string | null = null;
		try {
			reg.register({ provider: 'linear', originalName: 'ticket_read', inputSchema: noopSchema, handler: noopHandler });
		} catch (err) {
			collisionMessage = (err as Error).message;
		}

		expect({
			namespacedNames: reg.listAll().map((e) => e.name).sort(),
			linearJiraDistinct:
				reg.listByProvider('linear').map((r) => r.originalName)[0] ===
				reg.listByProvider('jira').map((r) => r.originalName)[0],
			collisionMessage,
		}).toEqual({
			namespacedNames: [
				'github__issue_read',
				'jira__ticket_read',
				'linear__ticket_read',
				'slack__thread_fetch',
			],
			linearJiraDistinct: true, // both have 'ticket_read' as originalName but namespacing keeps them distinct
			collisionMessage: 'ToolRegistry: tool name collision: linear__ticket_read',
		});
	});
});
