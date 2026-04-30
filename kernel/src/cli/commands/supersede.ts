/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/cli/commands/supersede.ts — Phase 2 (Plan 02-04) `goatide-cli graph supersede`.
//
// Reads the existing node's kind via dao.queryById so the user only re-types the body.
// Calls dao.supersede and prints {"newId":"<ULID>"} to stdout. Pitfall 7 alignment is
// guaranteed by the DAO; this command is a thin pass-through.

import type { Command } from 'commander';
import { GraphDAO, openDatabase, type NodePayload } from '../../graph/index.js';
import { resolveDbPath } from '../db-path.js';
import { formatError } from '../format.js';

interface SupersedeOptions {
	body: string;
	db?: string;
}

export function registerSupersede(parent: Command): void {
	parent.command('supersede')
		.description('Supersede an existing active node with a new body (kind inferred)')
		.argument('<node-id>', 'ULID of the node to supersede')
		.requiredOption('-b, --body <body>', 'New body text')
		.option('--db <path>', 'Database path override')
		.action((nodeId: string, opts: SupersedeOptions) => {
			const dbPath = resolveDbPath(opts.db);
			const handle = openDatabase(dbPath);
			try {
				const dao = new GraphDAO(handle.db);
				const existing = dao.queryById(nodeId);
				if (!existing) {
					console.error(formatError(new Error(`node ${nodeId} not found`), 'supersede failed'));
					process.exit(1);
				}
				const payload = { kind: existing.kind, body: opts.body } as NodePayload;
				const { newId } = dao.supersede(nodeId, payload);
				process.stdout.write(JSON.stringify({ newId }) + '\n');
			} catch (e) {
				console.error(formatError(e, 'supersede failed'));
				process.exit(1);
			} finally {
				handle.close();
			}
		});
}
