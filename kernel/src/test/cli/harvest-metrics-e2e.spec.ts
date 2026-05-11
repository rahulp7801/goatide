/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/cli/harvest-metrics-e2e.spec.ts
//
// Phase 10 Plan 10-00 (Wave 0) — RED stub staking out the end-to-end SC#4 closure for
// BRIDGE-POLISH-04. Plan 10-03 lands the actual e2e flow that:
//   1. Spawns the kernel daemon against an isolated GOATIDE_DB scratch directory.
//   2. Reads the lockfile to recover auth_token + port.
//   3. Opens a TCP RPC connection, authenticates, sends graph.recordContractOverride.
//   4. Awaits the Attempt-write response and closes the RPC connection.
//   5. spawnSyncs `goatide-cli harvest metrics --days 1` against the same GOATIDE_DB.
//   6. Asserts stdout exposes a non-zero `canvas overrides` column for today's UTC row.
//
// Scaffold pattern reuses harvest.spec.ts (scratch dir + GOATIDE_DB override + spawnSync CLI)
// and tcp-rpc.spec.ts (daemon spawn + lockfile read). Wave 0 ships the describe/beforeEach/
// afterEach lifecycle shells only — the it.skip body becomes a live it() in Plan 10-03.

import { describe, it, beforeEach, afterEach } from 'vitest';
import { spawnSync, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const CLI_ENTRY = resolve(__dirname, '..', '..', '..', 'dist', 'cli', 'index.js');

describe('BRIDGE-POLISH-04: harvest metrics shows non-zero contract_overrides after RPC', () => {
	let scratch: string;
	let dbPath: string;
	let daemon: ChildProcess | undefined;

	beforeEach(() => {
		scratch = mkdtempSync(join(tmpdir(), 'goatide-e2e-'));
		dbPath = join(scratch, 'graph.db');
	});

	afterEach(() => {
		if (daemon && !daemon.killed) {
			daemon.kill('SIGTERM');
			daemon = undefined;
		}
		if (scratch && existsSync(scratch)) {
			rmSync(scratch, { recursive: true, force: true });
		}
	});

	it.skip('end-to-end: bridge RPC -> metric write -> CLI surfaces non-zero count', async () => {
		// Plan 10-03 implements:
		//   1. spawn daemon with env GOATIDE_DB=dbPath; wait for lockfile.
		//   2. parse lockfile JSON -> { port, auth_token }.
		//   3. open vscode-jsonrpc TCP connection; send harvester.authenticate; then
		//      graph.recordContractOverride with a synthesized ContractNode + change_id.
		//   4. await response (attempt_node_id non-empty).
		//   5. spawnSync(CLI_ENTRY, ['harvest','metrics','--days','1'], { env: { ...process.env, GOATIDE_DB: dbPath } }).
		//   6. assert(stdout.match(/canvas overrides[^\n]*[1-9]/)).
		// CLI_ENTRY is captured at module load (build/dist precondition checked by Plan 10-03).
		void CLI_ENTRY;
		void dbPath;
		void spawnSync;
	});
});
