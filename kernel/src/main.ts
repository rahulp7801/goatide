/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/main.ts — Phase 3 (Plan 03-04) RPC daemon entry.
//
// REPLACES the Phase-1 heartbeat stub (which wrote to stdout — Pitfall 3 violation).
//
// Runtime contract:
//   1. Read DB path from GOATIDE_DB env var or platform default (resolveDbPath()).
//   2. openDatabase() runs migrations idempotently (PRAGMAs + 0000+0001+0002).
//   3. createRpcServer wires queryGraph + proposeEdit handlers.
//   4. connection.listen() starts serving on stdin/stdout.
//   5. ALL log output → STDERR (stdout reserved for JSON-RPC framing).
//   6. SIGTERM/SIGINT close the DB and exit cleanly.
//
// Phase 1's heartbeat is intentionally GONE. The bridge process can detect liveness
// via the JSON-RPC connection itself (connection drop = kernel down).

import { openDatabase, GraphDAO } from './graph/index.js';
import { ReceiptDAO } from './receipt/index.js';
import { resolveDbPath } from './cli/db-path.js';
import { createRpcServer } from './rpc/index.js';

const dbPath = process.env.GOATIDE_DB ?? resolveDbPath();
const handle = openDatabase(dbPath);
const dao = new GraphDAO(handle.db);
const receiptDao = new ReceiptDAO(handle.db);

const connection = createRpcServer({ dao, receiptDao, sqlite: handle.sqlite });
connection.listen();

// STDERR — stdout is reserved for JSON-RPC framing (Pitfall 3).
console.error(`[kernel] rpc up pid=${process.pid} db=${dbPath}`);

function shutdown(signal: NodeJS.Signals): void {
	console.error(`[kernel] received ${signal}, exiting cleanly`);
	try {
		handle.close();
	} catch (e) {
		console.error(`[kernel] close error: ${e instanceof Error ? e.message : String(e)}`);
	}
	process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
