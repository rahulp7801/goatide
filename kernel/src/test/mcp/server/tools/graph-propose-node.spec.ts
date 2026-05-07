/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/server/tools/graph-propose-node.spec.ts — Phase 6 (Plan 06-02)
// MCP-09 + MCP-05 graph.proposeNode v1 stub.
//
// Plan 06-02 ships graph.proposeNode as a stub returning isError:true with
// structuredContent.error=mcp_external_signal_routing_pending_06_05 (retryable:false).
// Plan 06-05 will replace the stub body with real submitRawObservation routing once the
// mcp_external_signal source is added to the Phase-5 RawObservationSchema discriminated
// union; the credential-cascade test below stays in it.skip with a refined message
// pointing at Plan 06-05.

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

describe('MCP-09 + MCP-05: graph.proposeNode tool wraps submitRawObservation', () => {
	let cleanup: (() => Promise<void>) | null = null;

	afterEach(async () => {
		if (cleanup) {
			await cleanup();
			cleanup = null;
		}
	});

	it('MCP-09: graph.proposeNode v1 stub returns mcp_external_signal_routing_pending_06_05 (retryable:false)', async () => {
		const tmp = mkTempDb();
		const sqlite = new Database(tmp.dbPath);
		const db = drizzle(sqlite);
		migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
		const dao = new GraphDAO(db);

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
		const client = new Client({ name: 'graph-propose-spec', version: '0.0.1' });
		await client.connect(transport);

		cleanup = async () => {
			await client.close();
			await handle.close();
			sqlite.close();
			tmp.dispose();
		};

		const result = await client.callTool({
			name: 'graph.proposeNode',
			arguments: { kind: 'ConstraintNode', body: 'arbitrary proposed node body' },
		});

		expect(result.isError).toBe(true);
		const sc = result.structuredContent as { error: string; retryable: boolean };
		expect(sc.error).toBe('mcp_external_signal_routing_pending_06_05');
		expect(sc.retryable).toBe(false);
	});

	it.skip('MCP-05: reject path: filter cascade catches credential-leak in proposed body — Plan 06-05 will replace stub with real submitRawObservation routing', () => {
		throw new Error('Plan 06-05 will wire real submitRawObservation routing once mcp_external_signal source is added to Phase-5 RawObservationSchema discriminated union; graph.proposeNode currently stubbed in Plan 06-02');
	});
});
