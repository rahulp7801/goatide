/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/schema-drift/detector.spec.ts — Phase 6 (Plan 06-04) MCP-07 detector.
//
// Three contracts pinned:
//  1. First-ever connect: snapshot absent → write baseline + return changed=false (Pitfall 5).
//  2. Identical second connect: same hashes → changed=false.
//  3. Modified second connect: different hashes → changed=true with per-tool was/now diff.
//
// Tests use a hand-rolled mock SDK Client whose listTools returns the slack-before / slack-after
// fixtures (Plan 06-01). XDG_CONFIG_HOME is redirected to a temp directory so the host's real
// ~/.config/goatide/ is never touched.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

import { snapshotAndDetectDrift } from '../../../mcp/schema-drift/detector.js';
import { resolveSchemaSnapshotPath } from '../../../mcp/schema-drift/paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixturesDir = resolve(__dirname, '..', 'fixtures', 'schema-drift-fixtures');
const slackBefore = JSON.parse(readFileSync(resolve(fixturesDir, 'slack-before.json'), 'utf8')) as {
	tools: Array<{ name: string; raw_schema: { input: unknown; output: unknown } }>;
};
const slackAfter = JSON.parse(readFileSync(resolve(fixturesDir, 'slack-after.json'), 'utf8')) as {
	tools: Array<{ name: string; raw_schema: { input: unknown; output: unknown } }>;
};

function makeClient(toolsFromFixture: typeof slackBefore.tools): Client {
	return {
		listTools: async () => ({
			tools: toolsFromFixture.map(t => ({
				name: t.name,
				inputSchema: t.raw_schema.input,
				outputSchema: t.raw_schema.output,
			})),
		}),
	} as unknown as Client;
}

describe('MCP-07: schema-drift detector — first-connect vs subsequent-connect semantics', () => {
	let tmpRoot: string;
	let prevXdg: string | undefined;
	let prevAppdata: string | undefined;

	beforeEach(() => {
		tmpRoot = mkdtempSync(join(tmpdir(), 'goatide-mcp-drift-'));
		prevXdg = process.env.XDG_CONFIG_HOME;
		prevAppdata = process.env.APPDATA;
		process.env.XDG_CONFIG_HOME = tmpRoot;
		process.env.APPDATA = tmpRoot;
	});

	afterEach(() => {
		if (prevXdg === undefined) {
			delete process.env.XDG_CONFIG_HOME;
		} else {
			process.env.XDG_CONFIG_HOME = prevXdg;
		}
		if (prevAppdata === undefined) {
			delete process.env.APPDATA;
		} else {
			process.env.APPDATA = prevAppdata;
		}
		rmSync(tmpRoot, { recursive: true, force: true });
	});

	it('MCP-07: first-ever connect: writes snapshot, returns changed=false (Pitfall 5 — no false-flag on cold start)', async () => {
		const client = makeClient(slackBefore.tools);
		const result = await snapshotAndDetectDrift({ provider: 'slack', client });
		const path = resolveSchemaSnapshotPath('slack');
		expect({
			result,
			snapshotWritten: existsSync(path),
		}).toEqual({
			result: { changed: false, changes: [] },
			snapshotWritten: true,
		});
	});

	it('MCP-07: identical second connect: returns changed=false', async () => {
		const client = makeClient(slackBefore.tools);
		// First connect writes baseline.
		await snapshotAndDetectDrift({ provider: 'slack', client });
		// Second connect with identical tools → no change.
		const result = await snapshotAndDetectDrift({ provider: 'slack', client });
		expect(result).toEqual({ changed: false, changes: [] });
	});

	it('MCP-07: modified second connect: returns changed=true with per-tool was/now hash diff', async () => {
		// First connect writes the slack-before baseline.
		await snapshotAndDetectDrift({ provider: 'slack', client: makeClient(slackBefore.tools) });
		// Second connect with slack-after (thread_fetch added a `cursor` input param).
		const result = await snapshotAndDetectDrift({ provider: 'slack', client: makeClient(slackAfter.tools) });
		expect({
			changed: result.changed,
			changeCount: result.changes.length,
			toolName: result.changes[0]?.tool,
			wasIsHex: /^[0-9a-f]{64}$/.test(result.changes[0]?.was ?? ''),
			nowIsHex: /^[0-9a-f]{64}$/.test(result.changes[0]?.now ?? ''),
			wasNotEqualNow: result.changes[0] ? result.changes[0].was !== result.changes[0].now : false,
		}).toEqual({
			changed: true,
			changeCount: 1,
			toolName: 'thread_fetch',
			wasIsHex: true,
			nowIsHex: true,
			wasNotEqualNow: true,
		});
	});
});
