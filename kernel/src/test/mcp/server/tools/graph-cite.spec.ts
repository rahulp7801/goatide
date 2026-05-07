/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/server/tools/graph-cite.spec.ts — Phase 6 (Plan 06-02) MCP-09 graph.cite
// drill-chain provenance walk.

import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { GraphDAO } from '../../../../graph/index.js';
import { mkTempDb } from '../../../helpers/temp-db.js';
import { startMcpServer, registerGraphTools, type McpServerHandle } from '../../../../mcp/index.js';
import { allocateLoopbackPort, makeBearerToken } from '../../../helpers/mcp-fixtures.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_FOLDER = resolve(__dirname, '..', '..', '..', '..', 'graph', 'migrations');

describe('MCP-09: graph.cite tool returns provenance walk', () => {
	let cleanup: (() => Promise<void>) | null = null;

	afterEach(async () => {
		if (cleanup) {
			await cleanup();
			cleanup = null;
		}
	});

	it('MCP-09: graph.cite returns drill_chains via existing provenance walk', async () => {
		const tmp = mkTempDb();
		const sqlite = new Database(tmp.dbPath);
		const db = drizzle(sqlite);
		migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
		const dao = new GraphDAO(db);

		// Seed one ConstraintNode with a recognizable provenance.detail. graph.cite should
		// return the node + a drill_chains entry containing the SAME source/actor we seeded.
		const anchorFile = '/repo/cite/foo.ts';
		const { id } = dao.seed({
			payload: { kind: 'ConstraintNode', body: 'must validate inputs', anchor: { file: anchorFile } },
			provenance: { source: 'cli', actor: 'cite-test', detail: { invocation: 'graph-cite-spec' } },
		});

		const port = await allocateLoopbackPort();
		const bearerToken = makeBearerToken();
		const handle: McpServerHandle = await startMcpServer({
			port,
			bearerToken,
			registerTools: (server) => registerGraphTools(server, { dao, sqlite }),
		});
		const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
			requestInit: { headers: { Authorization: `Bearer ${bearerToken}`, Origin: `http://127.0.0.1:${port}` } },
		});
		const client = new Client({ name: 'graph-cite-spec', version: '0.0.1' });
		await client.connect(transport);

		cleanup = async () => {
			await client.close();
			await handle.close();
			sqlite.close();
			tmp.dispose();
		};

		const result = await client.callTool({
			name: 'graph.cite',
			arguments: { anchor: { kind: 'file', path: anchorFile }, max_hops: 1 },
		});

		expect(result.isError).not.toBe(true);
		const sc = result.structuredContent as {
			nodes: Array<{ node_id: string }>;
			paths: string[];
			drill_chains: Array<{ node_id: string; provenance_walk: { source: string; actor: string; detail: Record<string, unknown> | null } | null }>;
		};

		expect(sc.nodes.length).toBeGreaterThanOrEqual(1);
		expect(sc.drill_chains.length).toBe(sc.nodes.length);
		const drilled = sc.drill_chains.find((d) => d.node_id === id);
		expect(drilled).toBeDefined();
		expect(drilled!.provenance_walk).not.toBeNull();
		expect(drilled!.provenance_walk!.source).toBe('cli');
		expect(drilled!.provenance_walk!.actor).toBe('cite-test');
		expect(drilled!.provenance_walk!.detail).toEqual({ invocation: 'graph-cite-spec' });
	});
});
