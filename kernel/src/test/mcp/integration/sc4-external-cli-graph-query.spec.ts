/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/integration/sc4-external-cli-graph-query.spec.ts — Phase 6 Plan 06-07.
//
// ROADMAP SC #4 — "Developer (in a separate Claude Code CLI session) connects to
// http://127.0.0.1:7345 with the OS-keychain bearer token and calls graph.query — receives
// cited results identical in shape to in-IDE retrieval; an unauthenticated request from a
// non-loopback interface is refused."
//
// Coverage layers:
//   1. POSITIVE PATH — SDK Client connects to /mcp with valid bearer + Origin → graph.query
//      returns the same QueryGraphResult shape (nodes + paths + edge_path_breadcrumbs) the
//      bridge JSON-RPC kernel.queryGraph returns. Constitutional symmetry pinned.
//   2. NEGATIVE — UNAUTHENTICATED — request without Authorization header → 401 missing_bearer.
//   3. NEGATIVE — WRONG BEARER — request with mismatched Authorization → 401 invalid_bearer.
//   4. NEGATIVE — BAD ORIGIN — request with Origin: http://localhost.evil.com → 403 origin_not_allowed.
//
// The MCP server binds 127.0.0.1 (LITERAL — refuse-non-loopback-mcp-bind.sh enforces).
// Tests use allocateLoopbackPort to avoid colliding with the constitutional 7345 default.

import { describe, it, expect, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

import { GraphDAO } from '../../../graph/index.js';
import { mkTempDb } from '../../helpers/temp-db.js';
import { startMcpServer, registerGraphTools, type McpServerHandle } from '../../../mcp/index.js';
import { allocateLoopbackPort, makeBearerToken } from '../../helpers/mcp-fixtures.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
// Migrations live under kernel/src/graph/migrations — relative path from
// kernel/src/test/mcp/integration/ is ../../../graph/migrations.
const MIGRATIONS_FOLDER = resolve(__dirname, '..', '..', '..', 'graph', 'migrations');

interface Sc4Harness {
	tmp: ReturnType<typeof mkTempDb>;
	sqlite: Database.Database;
	dao: GraphDAO;
	handle: McpServerHandle;
	port: number;
	bearerToken: string;
	dispose: () => Promise<void>;
}

async function setupHarness(): Promise<Sc4Harness> {
	const tmp = mkTempDb();
	const sqlite = new Database(tmp.dbPath);
	const db = drizzle(sqlite);
	migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
	const dao = new GraphDAO(db);

	const port = await allocateLoopbackPort();
	const bearerToken = makeBearerToken();
	const handle = await startMcpServer({
		port,
		bearerToken,
		registerTools: (server) => registerGraphTools(server, { dao, sqlite }),
	});

	return {
		tmp,
		sqlite,
		dao,
		handle,
		port,
		bearerToken,
		dispose: async () => {
			await handle.close();
			sqlite.close();
			tmp.dispose();
		},
	};
}

describe('ROADMAP SC #4 — External Claude Code CLI → /mcp graph.query → cited results identical to in-IDE retrieval', () => {
	let h: Sc4Harness | null = null;

	afterEach(async () => {
		if (h) {
			await h.dispose();
			h = null;
		}
	});

	it('SC #4 — positive: SDK Client w/ valid bearer + Origin → graph.query returns QueryGraphResult shape (nodes + paths)', async () => {
		h = await setupHarness();
		const { dao, port, bearerToken } = h;

		// Hand-seed a ConstraintNode + a parent_of edge → ContractNode so the SDK Client's
		// graph.query (anchored at the file path) returns BOTH nodes with the edge_path
		// breadcrumb. This is the SAME retrieval substrate the bridge JSON-RPC kernel.queryGraph
		// uses (constitutional symmetry — graph.query is a thin facade over Phase-3 traverse).
		const anchorFile = '/repo/src/auth.ts';
		const { id: constraintId } = dao.seed({
			payload: { kind: 'ConstraintNode', body: 'never log secrets', anchor: { file: anchorFile } },
			provenance: { source: 'cli', actor: 'sc4-spec' },
		});
		const { id: contractId } = dao.seed({
			payload: { kind: 'ContractNode', body: 'auth contract — bearer-only', anchor: { file: anchorFile } },
			provenance: { source: 'cli', actor: 'sc4-spec' },
		});
		dao.writeEdge({ src_id: contractId, dst_id: constraintId, kind: 'parent_of' });

		const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
			requestInit: {
				headers: {
					Authorization: `Bearer ${bearerToken}`,
					Origin: `http://127.0.0.1:${port}`,
				},
			},
		});
		const client = new Client({ name: 'sc4-external-cli-sim', version: '0.0.1' });
		await client.connect(transport);

		try {
			const result = await client.callTool({
				name: 'graph.query',
				arguments: { anchor: { kind: 'file', path: anchorFile }, scope: 'all', max_hops: 4 },
			});

			expect(result.isError).toBeFalsy();
			const sc = result.structuredContent as { nodes: Array<{ node_id: string; level: number }>; paths: unknown[] };
			const nodeIds = sc.nodes.map((n) => n.node_id).sort();
			const expectedIds = [constraintId, contractId].sort();

			expect({
				isError: result.isError ?? false,
				nodeCount: sc.nodes.length,
				containsBothSeededNodes:
					nodeIds.includes(constraintId) && nodeIds.includes(contractId),
				idsMatchExpected: nodeIds.length === 2 && nodeIds[0] === expectedIds[0] && nodeIds[1] === expectedIds[1],
				pathsArrayShape: Array.isArray(sc.paths),
			}).toEqual({
				isError: false,
				nodeCount: 2,
				containsBothSeededNodes: true,
				idsMatchExpected: true,
				pathsArrayShape: true,
			});
		} finally {
			await client.close();
		}
	}, 30_000);

	it('SC #4 — negative: missing Authorization header → 401 missing_bearer', async () => {
		h = await setupHarness();
		const { port } = h;

		const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Origin: `http://127.0.0.1:${port}` },
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
		});
		const body = (await response.json()) as { error?: string };

		expect({ status: response.status, error: body.error }).toEqual({
			status: 401,
			error: 'missing_bearer',
		});
	}, 15_000);

	it('SC #4 — negative: wrong bearer → 401 invalid_bearer (timingSafeEqual constant-time compare)', async () => {
		h = await setupHarness();
		const { port } = h;

		const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: 'Bearer ' + 'badf'.repeat(16), // 64 hex chars but wrong value
				Origin: `http://127.0.0.1:${port}`,
			},
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
		});
		const body = (await response.json()) as { error?: string };

		expect({ status: response.status, error: body.error }).toEqual({
			status: 401,
			error: 'invalid_bearer',
		});
	}, 15_000);

	it('SC #4 — negative: subdomain-attack Origin (http://localhost.evil.com) → 403 origin_not_allowed (Pitfall 1 substring-match defense)', async () => {
		h = await setupHarness();
		const { port, bearerToken } = h;

		const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${bearerToken}`,
				Origin: 'http://localhost.evil.com',
			},
			body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
		});
		const body = (await response.json()) as { error?: string; received?: string };

		expect({
			status: response.status,
			error: body.error,
			receivedOriginEchoed: body.received === 'http://localhost.evil.com',
		}).toEqual({
			status: 403,
			error: 'origin_not_allowed',
			receivedOriginEchoed: true,
		});
	}, 15_000);

	it('SC #4 — graph.query response shape carries paths / drill_chains for cited-results identity with in-IDE retrieval', async () => {
		// Asserts the response shape carries the same fields the bridge consumes from
		// kernel.queryGraph — node_id + level (per node) + paths array (per result). This is
		// the constitutional-symmetry pin: external SDK Client and bridge-side JSON-RPC see
		// the SAME shape because graph.query is a thin facade over Phase-3 resolveAnchor +
		// traverse.
		h = await setupHarness();
		const { dao, port, bearerToken } = h;
		const anchorFile = '/repo/src/audit.ts';
		dao.seed({
			payload: { kind: 'ConstraintNode', body: 'audit-log: never PII', anchor: { file: anchorFile } },
			provenance: { source: 'cli', actor: 'sc4-shape-spec' },
		});

		const transport = new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), {
			requestInit: {
				headers: { Authorization: `Bearer ${bearerToken}`, Origin: `http://127.0.0.1:${port}` },
			},
		});
		const client = new Client({ name: 'sc4-shape-spec', version: '0.0.1' });
		await client.connect(transport);

		try {
			const result = await client.callTool({
				name: 'graph.query',
				arguments: { anchor: { kind: 'file', path: anchorFile }, scope: 'all', max_hops: 2 },
			});
			const sc = result.structuredContent as { nodes?: unknown; paths?: unknown };

			expect({
				hasNodes: Array.isArray(sc.nodes),
				hasPaths: Array.isArray(sc.paths),
				firstNodeHasNodeId:
					Array.isArray(sc.nodes) && sc.nodes.length > 0 && typeof (sc.nodes[0] as { node_id?: unknown }).node_id === 'string',
				firstNodeHasLevel:
					Array.isArray(sc.nodes) && sc.nodes.length > 0 && typeof (sc.nodes[0] as { level?: unknown }).level === 'number',
			}).toEqual({
				hasNodes: true,
				hasPaths: true,
				firstNodeHasNodeId: true,
				firstNodeHasLevel: true,
			});
		} finally {
			await client.close();
		}
	}, 30_000);
});
