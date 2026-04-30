/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/cli/commands/query.ts — Phase 2 (Plan 02-04) `goatide-cli graph query`.
//
// Inspects the graph by id, by kind, or as-of a past timestamp. Defaults to the active
// set across all kinds when no flag is provided. --json switches the human-friendly
// fixed-width table to a JSON array for scripting.

import type { Command } from 'commander';
import { GraphDAO, openDatabase, NODE_KINDS, type NodeRow } from '../../graph/index.js';
import { resolveDbPath } from '../db-path.js';
import { formatNodeTable, formatNodeJson, formatError } from '../format.js';
import { KIND_ALIAS, resolveKindAlias } from '../kind-alias.js';

interface QueryOptions {
	id?: string;
	kind?: string;
	at?: string;
	json: boolean;
	db?: string;
}

export function registerQuery(parent: Command): void {
	parent.command('query')
		.description('Inspect the graph (by id, by kind, or as-of a past time)')
		.option('--id <id>', 'Look up a single node by ULID')
		.option('-k, --kind <kind>', `Filter by kind alias (${Object.keys(KIND_ALIAS).join('|')})`)
		.option('--at <iso8601>', 'Bitemporal as-of timestamp; default = now (active set)')
		.option('--json', 'Emit JSON array instead of a table', false)
		.option('--db <path>', 'Database path override')
		.action((opts: QueryOptions) => {
			const dbPath = resolveDbPath(opts.db);
			const handle = openDatabase(dbPath);
			try {
				const dao = new GraphDAO(handle.db);
				let rows: NodeRow[];
				if (opts.id) {
					const r = dao.queryById(opts.id);
					rows = r ? [r] : [];
				} else if (opts.kind) {
					const canonical = resolveKindAlias(opts.kind);
					if (!canonical) {
						console.error(formatError(new Error(`unknown kind '${opts.kind}'`), 'query failed'));
						process.exit(1);
					}
					rows = dao.queryByKind(canonical, opts.at);
				} else if (opts.at) {
					rows = dao.queryAsOf(opts.at);
				} else {
					// Default: active set across all kinds.
					rows = NODE_KINDS.flatMap((k) => dao.queryByKind(k));
				}
				process.stdout.write(opts.json ? formatNodeJson(rows) : formatNodeTable(rows));
			} catch (e) {
				console.error(formatError(e, 'query failed'));
				process.exit(1);
			} finally {
				handle.close();
			}
		});
}
