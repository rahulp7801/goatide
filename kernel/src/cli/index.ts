/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/cli/index.ts — Phase 2 (Plan 02-04) commander entry point.
//
// The bin shim at kernel/bin/goatide-cli (Plan 02-01) does `import('../dist/cli/index.js')`
// — this file IS that artifact at the source level. tsc emits dist/cli/index.js.
// (No shebang needed: the bin shim is the executable wrapper; this module is import()ed
// dynamically, where shebangs are inert anyway.)
//
// Per 02-RESEARCH.md ## Pattern: CLI Tooling. The three subcommand registrars live in
// ./commands/{seed,supersede,query}.ts and each adopts a (parent: Command) signature so
// this file remains a thin assembly point.

import { Command } from 'commander';
import { registerSeed } from './commands/seed.js';
import { registerSupersede } from './commands/supersede.js';
import { registerQuery } from './commands/query.js';

const program = new Command();
program
	.name('goatide-cli')
	.description('GoatIDE bitemporal graph CLI (Phase 2 hand-seed harness)')
	.version('0.0.1');

const graph = program.command('graph').description('Hand-seed and inspect the bitemporal graph');
registerSeed(graph);
registerSupersede(graph);
registerQuery(graph);

program.parseAsync(process.argv).catch((err: unknown) => {
	// Top-level safety net; commander handles parse-time errors itself.
	console.error('[goatide-cli]', err instanceof Error ? err.message : String(err));
	process.exit(1);
});
