/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/server/tools/graph-query.ts — Phase 6 (Plan 06-02) graph.query MCP tool.
//
// CONSTITUTIONAL SYMMETRY: this is a thin facade over the EXISTING Phase-3 traversal —
// resolveAnchor + traverse from kernel/src/graph/index.ts — the same code path the bridge
// JSON-RPC handler uses for graph.queryGraph. ZERO new retrieval code; ZERO duplication of
// the TRAV-04 deterministic anchor resolver.
//
// Mandate-C: empty result on unresolvable anchor — no fuzzy fallback, no did-you-mean,
// no embedding similarity. The CI gate refuse-fuzzy-fallback.sh enforces this against any
// future contributor reaching for similarity in retrieval code.

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type Database from 'better-sqlite3';
import { type GraphDAO, resolveAnchor, traverse, type Scope, type TraverseRow } from '../../../graph/index.js';

/**
 * Input shape for graph.query. Mirrors the bridge's JSON-RPC QueryGraphParams (kernel/src/
 * rpc/methods.ts) so external MCP clients see the same surface as the in-IDE bridge — one
 * source-of-truth for "how do I query the graph?".
 *
 * The `anchor` discriminated union supports the 4 anchor kinds Phase 3 ships: file path,
 * symbol name, ticket id, or direct node id.
 */
const AnchorInput = z.union([
	z.object({ kind: z.literal('file'), path: z.string() }),
	z.object({ kind: z.literal('symbol'), symbol: z.string() }),
	z.object({ kind: z.literal('ticket'), id: z.string() }),
	z.object({ kind: z.literal('node_id'), id: z.string() }),
]);

const ScopeInput = z.union([
	z.literal('parents'),
	z.literal('siblings'),
	z.literal('references'),
	z.literal('all'),
]);

/**
 * `inputSchema` for SDK's registerTool is a ZodRawShape (object of zod schemas), NOT a
 * z.object(...) wrapper. The SDK internally wraps the raw shape into z.object(...).
 */
export const GraphQueryInputShape = {
	anchor: AnchorInput,
	scope: ScopeInput.optional(),
	max_hops: z.number().int().min(1).max(10).optional(),
	at: z.string().optional(),
} as const;

export interface GraphQueryDeps {
	dao: GraphDAO;
	sqlite: Database.Database;
}

/**
 * Run the same resolveAnchor + traverse pipeline the bridge JSON-RPC handler uses. Empty
 * anchor result short-circuits to {nodes:[], paths:[]} — Mandate-C, no fuzzy fallback.
 */
export function runGraphQuery(
	deps: GraphQueryDeps,
	args: {
		anchor: z.infer<typeof AnchorInput>;
		scope?: Scope;
		max_hops?: number;
		at?: string;
	},
): { nodes: TraverseRow[]; paths: string[] } {
	const at = args.at ?? new Date().toISOString();
	const seedNodes = resolveAnchor(deps.dao, args.anchor, at);
	if (seedNodes.length === 0) {
		return { nodes: [], paths: [] };
	}
	const traversal = traverse(deps.sqlite, {
		anchorIds: seedNodes.map((n) => n.id),
		scope: args.scope ?? 'all',
		max_hops: args.max_hops ?? 4,
		at,
	});
	return { nodes: traversal.nodes, paths: traversal.paths };
}

/**
 * Register graph.query on the McpServer. The handler returns the QueryGraphResult shape
 * inside CallToolResult.structuredContent so SDK clients can decode without re-parsing
 * a JSON string from the content[].text payload.
 */
export function registerGraphQueryTool(server: McpServer, deps: GraphQueryDeps): void {
	server.registerTool(
		'graph.query',
		{
			title: 'Query the GoatIDE bitemporal graph',
			description:
				'Resolve an anchor (file/symbol/ticket/node_id) then traverse the graph by scope/max_hops. ' +
				'Returns Phase-3 QueryGraphResult shape. Mandate-C: empty result on unresolvable anchor.',
			inputSchema: GraphQueryInputShape,
		},
		async (args) => {
			const result = runGraphQuery(deps, args);
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
