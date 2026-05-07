/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/server/tools/index.ts — Phase 6 (Plan 06-02 + Plan 06-05) graph.* tool registration.
//
// One entry point — registerGraphTools — calls each per-tool registrar. The McpServer (from
// kernel/src/mcp/server/http-server.ts) hands itself to this function during startup; the
// tools are visible via tools/list immediately after.
//
// Plan 06-05 — graph.proposeNode transitions from a stub (Plan 06-02) to real routing through
// the Phase-5 conveyor. The dispatcher now requires `harvesterDeps` so graph.proposeNode can
// invoke routeMcpObservation -> submitRawObservation.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Database from 'better-sqlite3';
import type { GraphDAO } from '../../../graph/index.js';
import type { HarvesterDeps } from '../../../harvester/index.js';
import { registerGraphQueryTool } from './graph-query.js';
import { registerGraphCiteTool } from './graph-cite.js';
import { registerGraphProposeNodeTool } from './graph-propose-node.js';
import { registerGraphSubscribeTool } from './graph-subscribe.js';

export interface GraphToolDeps {
	dao: GraphDAO;
	sqlite: Database.Database;
	/**
	 * Phase 6 Plan 06-05 — required for graph.proposeNode real routing through Phase-5
	 * cascade. Optional in transitional callers (Phase-6 partial test harnesses) — when
	 * undefined, graph.proposeNode is NOT registered (the tool simply doesn't appear in
	 * tools/list rather than registering with a broken handler).
	 */
	harvesterDeps?: HarvesterDeps;
}

/**
 * Register all 4 graph.* MCP tools on the McpServer in one call. The order is alphabetical —
 * MCP tool registration order doesn't affect tools/list ordering on the SDK side, but a
 * stable order keeps the source-of-truth obvious.
 */
export function registerGraphTools(server: McpServer, deps: GraphToolDeps): void {
	registerGraphCiteTool(server, deps);
	if (deps.harvesterDeps) {
		registerGraphProposeNodeTool(server, { harvesterDeps: deps.harvesterDeps });
	}
	registerGraphQueryTool(server, deps);
	registerGraphSubscribeTool(server);
}
