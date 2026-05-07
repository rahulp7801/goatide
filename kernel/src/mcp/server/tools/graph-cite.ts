/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/server/tools/graph-cite.ts — Phase 6 (Plan 06-02) graph.cite MCP tool.
//
// graph.cite IS graph.query with include_drill_chain forced true. For each returned node
// we walk REC-06 provenance via the existing Phase-3 explainCitation function. Output adds
// a `drill_chains` array parallel to `nodes` containing the provenance walk per node.

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Database from 'better-sqlite3';
import { type GraphDAO, type ProvenanceRow } from '../../../graph/index.js';
import { runGraphQuery, GraphQueryInputShape } from './graph-query.js';

export interface GraphCiteDeps {
	dao: GraphDAO;
	sqlite: Database.Database;
}

/**
 * Per-node REC-06 provenance walk. Equivalent to receipt/render.ts ProvenanceTrail but
 * shaped for direct MCP serialization (no Citation indirection — graph.cite generates the
 * walk from the node row itself, not from a pre-built receipt).
 */
export interface ProvenanceWalk {
	node_id: string;
	source: string;
	actor: string;
	recorded_at: string;
	detail: Record<string, unknown> | null;
}

export interface GraphCiteResult {
	nodes: ReturnType<typeof runGraphQuery>['nodes'];
	paths: string[];
	drill_chains: Array<{ node_id: string; provenance_walk: ProvenanceWalk | null }>;
}

/**
 * Register graph.cite on the McpServer. Same input schema as graph.query (no separate
 * `include_drill_chain` field — citation walk is what graph.cite IS) plus the drill_chains
 * augmentation in the response.
 */
export function registerGraphCiteTool(server: McpServer, deps: GraphCiteDeps): void {
	server.registerTool(
		'graph.cite',
		{
			title: 'Cite graph nodes with provenance walk',
			description:
				'Same as graph.query but each returned node is enriched with its REC-06 provenance walk ' +
				'(source/actor/recorded_at/detail) — the audit trail an external agent shows when asked ' +
				'"why was this rule recorded?".',
			inputSchema: GraphQueryInputShape,
		},
		async (args) => {
			const queryResult = runGraphQuery(deps, args);
			// Walk provenance for each returned node directly via the DAO. We don't build a
			// synthetic Citation because graph.cite is anchored to the node, not to a pre-built
			// receipt; the walk-from-node-id surface here is the same one Phase-3 explainCitation
			// uses internally (queryProvenance).
			const drill_chains = queryResult.nodes.map((row) => {
				const prov: ProvenanceRow | null = deps.dao.queryProvenance(row.node_id);
				const provenance_walk: ProvenanceWalk | null = prov
					? {
						node_id: prov.node_id,
						source: prov.source,
						actor: prov.actor,
						recorded_at: prov.recorded_at,
						detail: prov.detail,
					}
					: null;
				return { node_id: row.node_id, provenance_walk };
			});
			const result: GraphCiteResult = {
				nodes: queryResult.nodes,
				paths: queryResult.paths,
				drill_chains,
			};
			return {
				content: [
					{
						type: 'text' as const,
						text: JSON.stringify(result),
					},
				],
				structuredContent: result as unknown as Record<string, unknown>,
			};
		},
	);
}
