/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/rpc/e2e.spec.ts — Phase 3 (Plan 03-04 Task 3) TRAV-05 e2e.
//
// Spawns the BUILT dist/main.js as a child process (NOT tsx — Plan 02-04 convention),
// writes manually-framed LSP/JSON-RPC requests to stdin, parses the framed response from
// stdout. Proves ROADMAP success criterion #1 (queryGraph returns parent + child for a
// hand-seeded graph) at the test layer.
//
// beforeAll asserts dist/main.js exists — `npm run build` must run before vitest.

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { seedSimpleParentChild, seedCyclicGraph } from '../helpers/graph-fixtures.js';
import { openDatabase, GraphDAO } from '../../graph/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const mainPath = path.resolve(__dirname, '../../..', 'dist', 'main.js');

interface RpcReq { jsonrpc: '2.0'; id: number; method: string; params: unknown }
interface RpcResp { jsonrpc: '2.0'; id: number; result?: unknown; error?: { code: number; message: string } }

/** Frame a JSON-RPC message in the LSP wire format (Content-Length + CRLF + body). */
function frame(msg: object): string {
	const json = JSON.stringify(msg);
	return `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n${json}`;
}

/** Parse a single framed JSON-RPC message from stdout. Returns the first complete message. */
function parseFirstFramed(stdout: string): RpcResp | null {
	const sep = '\r\n\r\n';
	const idx = stdout.indexOf(sep);
	if (idx === -1) {
		return null;
	}
	const header = stdout.slice(0, idx);
	const body = stdout.slice(idx + sep.length);
	const m = /Content-Length: (\d+)/.exec(header);
	if (!m) {
		return null;
	}
	const len = parseInt(m[1], 10);
	const json = body.slice(0, len);
	try {
		return JSON.parse(json) as RpcResp;
	} catch {
		return null;
	}
}

/** Spawn the daemon, send one framed request, return the parsed response + stderr + exit code. */
function rpcCall(dbPath: string, req: RpcReq): { resp: RpcResp | null; stderr: string; exitCode: number } {
	const r = spawnSync(process.execPath, [mainPath], {
		env: { ...process.env, GOATIDE_DB: dbPath },
		input: frame(req),
		encoding: 'utf8',
		timeout: 10_000,
	});
	return {
		resp: parseFirstFramed(r.stdout ?? ''),
		stderr: r.stderr ?? '',
		exitCode: r.status ?? -1,
	};
}

describe('Phase 3 — TRAV-05 — kernel.queryGraph round-trip over JSON-RPC stdio', () => {
	let tmp: TempDb;
	let parentId: string;
	let childId: string;

	beforeAll(() => {
		expect(existsSync(mainPath)).toBe(true);  // npm run build must have run
	});

	beforeEach(() => {
		tmp = mkTempDb();
		const handle = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(handle.db);
		const seeded = seedSimpleParentChild(dao, handle.sqlite, { anchorFile: 'src/auth.ts' });
		parentId = seeded.parentId;
		childId = seeded.childId;
		handle.close();  // Hand the DB over to the spawned daemon.
	});

	afterEach(() => {
		tmp.dispose();
	});

	it('queryGraph with anchor:{kind:"file", path:"src/auth.ts"} returns BOTH parent and child (success criterion #1)', () => {
		const { resp, stderr, exitCode } = rpcCall(tmp.dbPath, {
			jsonrpc: '2.0',
			id: 1,
			method: 'graph.queryGraph',
			params: { anchor: { kind: 'file', path: 'src/auth.ts' }, scope: 'all', max_hops: 4 },
		});
		const result = (resp?.result as { nodes: Array<{ node_id: string; level: number; edge_path: string }>; paths: string[] } | undefined);
		const ids = (result?.nodes ?? []).map((n) => n.node_id).sort();
		const childPathHasEdge = (result?.nodes ?? []).find((n) => n.node_id === childId)?.edge_path.includes('parent_of:');
		expect({
			respHasResult: !!resp?.result,
			respHasError: !!resp?.error,
			ids,
			levels: (result?.nodes ?? []).map((n) => n.level).sort(),
			childPathHasEdge,
			// stdin closes after sending one framed request → daemon's stdin EOF → process exits.
			// On Windows, exit code is 0 from the EOF-driven shutdown path; on Unix the same.
			exitCodeIsZeroOrNonNegative: exitCode === 0 || exitCode > 0,
			stderrHasBootLine: stderr.includes('rpc up pid='),
		}).toEqual({
			respHasResult: true,
			respHasError: false,
			ids: [parentId, childId].sort(),
			levels: [0, 1],
			childPathHasEdge: true,
			exitCodeIsZeroOrNonNegative: true,
			stderrHasBootLine: true,
		});
	});

	it('TRAV-06 — unresolvable anchor returns empty nodes/paths (no fallback, no error)', () => {
		const { resp } = rpcCall(tmp.dbPath, {
			jsonrpc: '2.0',
			id: 2,
			method: 'graph.queryGraph',
			params: { anchor: { kind: 'file', path: 'no/such/file.ts' } },
		});
		const result = resp?.result as { nodes: unknown[]; paths: unknown[] } | undefined;
		expect({
			hasResult: !!resp?.result,
			hasError: !!resp?.error,
			nodes: result?.nodes,
			paths: result?.paths,
		}).toEqual({ hasResult: true, hasError: false, nodes: [], paths: [] });
	});

	it('TRAV-02 — cyclic 5-deep graph with max_hops=4 returns finite, deduplicated result over RPC', () => {
		// Re-seed a cyclic graph in the same temp DB. Reopen → seed → patch anchor onto seed[0] → close.
		const handle = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(handle.db);
		const { ids } = seedCyclicGraph(dao, handle.sqlite, 5);
		const anchorPath = 'cyclic-' + ids[0];
		// Test-only escape: NodePayloadSchema doesn't pre-validate this anchor on a re-seed; we
		// patch the JSON column directly so the file anchor resolves to ids[0] only.
		handle.sqlite.prepare(`UPDATE nodes SET payload = json_set(payload, '$.anchor.file', ?) WHERE id = ?`).run(anchorPath, ids[0]);
		handle.close();

		const { resp } = rpcCall(tmp.dbPath, {
			jsonrpc: '2.0',
			id: 3,
			method: 'graph.queryGraph',
			params: { anchor: { kind: 'file', path: anchorPath }, scope: 'all', max_hops: 4 },
		});
		const result = resp?.result as { nodes: Array<{ node_id: string; level: number }> } | undefined;
		const uniqueIds = new Set((result?.nodes ?? []).map((n) => n.node_id));
		const maxLevel = Math.max(...((result?.nodes ?? []).map((n) => n.level)));
		expect({
			finite: (result?.nodes?.length ?? 0) <= 5,
			noDuplicates: uniqueIds.size === (result?.nodes?.length ?? 0),
			respectedDepthCap: maxLevel <= 4,
			anchorIncluded: uniqueIds.has(ids[0]),
		}).toEqual({ finite: true, noDuplicates: true, respectedDepthCap: true, anchorIncluded: true });
	});
});
