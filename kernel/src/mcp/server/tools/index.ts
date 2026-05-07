/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/server/tools/index.ts — Phase 6 (Plan 06-02) graph.* tool registration.
//
// One entry point — registerGraphTools — calls each per-tool registrar. The McpServer (from
// kernel/src/mcp/server/http-server.ts) hands itself to this function during startup; the
// tools are visible via tools/list immediately after.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Database from 'better-sqlite3';
import type { GraphDAO } from '../../../graph/index.js';
import { registerGraphQueryTool } from './graph-query.js';
import { registerGraphCiteTool } from './graph-cite.js';
import { registerGraphProposeNodeTool } from './graph-propose-node.js';
import { registerGraphSubscribeTool } from './graph-subscribe.js';

export interface GraphToolDeps {
	dao: GraphDAO;
	sqlite: Database.Database;
}

/**
 * Register all 4 graph.* MCP tools on the McpServer in one call. The order is alphabetical —
 * MCP tool registration order doesn't affect tools/list ordering on the SDK side, but a
 * stable order keeps the source-of-truth obvious.
 */
export function registerGraphTools(server: McpServer, deps: GraphToolDeps): void {
	registerGraphCiteTool(server, deps);
	registerGraphProposeNodeTool(server);
	registerGraphQueryTool(server, deps);
	registerGraphSubscribeTool(server);
}
