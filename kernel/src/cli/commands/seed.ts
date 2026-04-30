/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/cli/commands/seed.ts — Phase 2 (Plan 02-04) `goatide-cli graph seed`.
//
// Calls dao.seed and prints {"id":"<ULID>"} to stdout on success; non-zero exit with
// formatted stderr on Zod failure (Ghosting / unknown kind / missing body). Phase 2
// only writes confidence='Explicit' (RESEARCH user_constraints), so the --confidence
// flag is intentionally absent — the DAO ignores caller confidence anyway.

import type { Command } from 'commander';
import { GraphDAO, openDatabase, type NodePayload } from '../../graph/index.js';
import { resolveDbPath } from '../db-path.js';
import { formatError } from '../format.js';
import { KIND_ALIAS, resolveKindAlias } from '../kind-alias.js';

interface SeedOptions {
	kind: string;
	body: string;
	source: string;
	actor: string;
	db?: string;
}

export function registerSeed(parent: Command): void {
	parent.command('seed')
		.description('Seed a typed node into the graph')
		.requiredOption('-k, --kind <kind>', `Node kind alias: ${Object.keys(KIND_ALIAS).join('|')}`)
		.requiredOption('-b, --body <body>', 'Body text (rejected if it contains "thanks/finished/summary")')
		.option('--source <source>', 'Provenance source identifier', 'cli')
		.option('--actor <actor>', 'Provenance actor identifier', process.env.USER ?? process.env.USERNAME ?? 'unknown')
		.option('--db <path>', 'Database path override')
		.action((opts: SeedOptions) => {
			const canonicalKind = resolveKindAlias(opts.kind);
			if (!canonicalKind) {
				const valid = Object.keys(KIND_ALIAS).join('|');
				console.error(formatError(new Error(`unknown kind '${opts.kind}'. Valid: ${valid}`), 'seed failed'));
				process.exit(1);
			}
			const dbPath = resolveDbPath(opts.db);
			const handle = openDatabase(dbPath);
			try {
				const dao = new GraphDAO(handle.db);
				// The discriminated-union payload type narrows by `kind`, but the alias resolution
				// happens at the CLI boundary; cast at the cast-site so the DAO receives the
				// proper NodePayload shape.
				const payload = { kind: canonicalKind, body: opts.body } as NodePayload;
				const { id } = dao.seed({
					payload,
					provenance: {
						source: opts.source,
						actor: opts.actor,
						detail: { invocation: process.argv.slice(2).join(' ') },
					},
				});
				process.stdout.write(JSON.stringify({ id }) + '\n');
			} catch (e) {
				console.error(formatError(e, 'seed failed'));
				process.exit(1);
			} finally {
				handle.close();
			}
		});
}
