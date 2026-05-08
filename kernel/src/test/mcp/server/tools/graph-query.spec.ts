/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/server/tools/graph-query.spec.ts — Phase 6 (Plan 06-02) MCP-09 + MCP-10
// graph.query round-trip via SDK Client → /mcp → server → kernel.queryGraph.

import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { GraphDAO } from '../../../../graph/index.js';
import { mkTempDb, migrateInUnsafeMode } from '../../../helpers/temp-db.js';
import { startMcpServer, registerGraphTools, type McpServerHandle } from '../../../../mcp/index.js';
import { allocateLoopbackPort, makeBearerToken } from '../../../helpers/mcp-fixtures.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Migrations live under kernel/src/graph/migrations — relative path from
// kernel/src/test/mcp/server/tools/ is ../../../../graph/migrations.
const MIGRATIONS_FOLDER = resolve(__dirname, '..', '..', '..', '..', 'graph', 'migrations');

interface Harness {
	tmp: ReturnType<typeof mkTempDb>;
	sqlite: Database.Database;
	dao: GraphDAO;
	handle: McpServerHandle;
	client: Client;
	dispose: () => Promise<void>;
}

async function setupHarness(): Promise<Harness> {
	const tmp = mkTempDb();
	const sqlite = new Database(tmp.dbPath);
	const db = drizzle(sqlite);
	migrateInUnsafeMode(sqlite, db, MIGRATIONS_FOLDER);
	const dao = new GraphDAO(db);

	const port = await allocateLoopbackPort();
	const bearerToken = makeBearerToken();
	const handle = await startMcpServer({
		port,
		bearerToken,
		registerTools: (server) => registerGraphTools(server, { dao, sqlite }),
	});

	const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
		requestInit: { headers: { Authorization: `Bearer ${bearerToken}`, Origin: `http://127.0.0.1:${port}` } },
	});
	const client = new Client({ name: 'graph-query-spec', version: '0.0.1' });
	await client.connect(transport);

	return {
		tmp, sqlite, dao, handle, client,
		dispose: async () => {
			await client.close();
			await handle.close();
			sqlite.close();
			tmp.dispose();
		},
	};
}

describe('MCP-09 + MCP-10: graph.query tool exposes Phase-3 queryGraph via MCP', () => {
	let h: Harness | null = null;

	afterEach(async () => {
		if (h) {
			await h.dispose();
			h = null;
		}
	});

	it('MCP-09 + MCP-10: routes through resolveAnchor + traverse; response shape matches QueryGraphResult', async () => {
		h = await setupHarness();
		const { dao, client } = h;

		// Hand-seed a ConstraintNode anchored to a file path. graph.query with anchor.kind=file
		// should resolve it and return it at level 0.
		const anchorFile = '/repo/src/foo.ts';
		const { id } = dao.seed({
			payload: { kind: 'ConstraintNode', body: 'never log secrets', anchor: { file: anchorFile } },
			provenance: { source: 'cli', actor: 'spec' },
		});

		const result = await client.callTool({
			name: 'graph.query',
			arguments: { anchor: { kind: 'file', path: anchorFile }, scope: 'all', max_hops: 2 },
		});

		expect(result.isError).not.toBe(true);
		const sc = result.structuredContent as { nodes: Array<{ node_id: string; level: number }>; paths: string[] };
		expect(sc.nodes.length).toBeGreaterThanOrEqual(1);
		expect(sc.nodes[0].node_id).toBe(id);
		expect(sc.nodes[0].level).toBe(0);
		expect(Array.isArray(sc.paths)).toBe(true);
	});

	it('MCP-10: unresolvable anchor returns empty {nodes:[], paths:[]} (Mandate-C — no fuzzy fallback)', async () => {
		h = await setupHarness();
		const { client } = h;

		const result = await client.callTool({
			name: 'graph.query',
			arguments: { anchor: { kind: 'file', path: '/nonexistent/path/that/has/no/node.ts' }, scope: 'all', max_hops: 4 },
		});

		expect(result.isError).not.toBe(true);
		const sc = result.structuredContent as { nodes: unknown[]; paths: unknown[] };
		expect(sc.nodes).toEqual([]);
		expect(sc.paths).toEqual([]);
	});

	it('MCP-09: depth-cap and at-time parameters honored', async () => {
		h = await setupHarness();
		const { dao, client } = h;

		// Hand-seed a single node anchored to file. We assert max_hops=1 still returns the
		// anchor (level 0) and at='1970-01-01T00:00:00Z' returns nothing (no nodes existed
		// at the unix epoch). This covers both the depth-cap passthrough and the bitemporal
		// at-time passthrough end-to-end through the MCP tool surface.
		const anchorFile = '/repo/src/bar.ts';
		dao.seed({
			payload: { kind: 'ConstraintNode', body: 'phase-6 fixture', anchor: { file: anchorFile } },
			provenance: { source: 'cli', actor: 'spec' },
		});

		const present = await client.callTool({
			name: 'graph.query',
			arguments: { anchor: { kind: 'file', path: anchorFile }, max_hops: 1 },
		});
		expect((present.structuredContent as { nodes: unknown[] }).nodes.length).toBeGreaterThanOrEqual(1);

		const epoch = await client.callTool({
			name: 'graph.query',
			arguments: { anchor: { kind: 'file', path: anchorFile }, at: '1970-01-01T00:00:00.000Z' },
		});
		expect((epoch.structuredContent as { nodes: unknown[] }).nodes).toEqual([]);
	});
});
