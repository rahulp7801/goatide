/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/integration/cross-repo-edge-activation.integrationTest.ts -- Phase 21 Plan 21-03 XREPO-03.
//
// End-to-end integration test: proves the Phase 16 + Phase 17 + Phase 21 cross-repo
// activation chain works on a real SQLite fixture.
//
// Chain:
//   1. Raw-SQL seed a ConstraintNode in repo-B (bypasses dao.seed 'primary' default
//      per Open Decision Sec.3 -- column-level repo_id writes are v2.2 work).
//   2. Start kernel daemon against the same temp DB.
//   3. proposeEdit with a diff citing the repo-B anchor file -> buildReceipt ->
//      queryByAnchor (repoId=undefined Path-B cross-repo opt-in per Plan 21-02).
//   4. atomicAccept creates an Attempt (repo_id='primary' in v2.1; v2.2 will set it to
//      repoA_fingerprint) + a 'references' edge to the repo-B ConstraintNode.
//   5. Render via edgeRowToCyElement with nodesById containing both endpoint nodes.
//   6. Assert data.crossRepo === true (because Attempt.repo_id='primary' != ConstraintNode.repo_id=repoB_fp).
//
// Grep pattern: 'cross-repo-edge-activation' (21-VALIDATION.md XREPO-03 verification row).

import { describe, it, before, after } from 'mocha';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { ulid } from 'ulid';
import { KernelClient } from '../../src/kernel/client.js';
import { applyEditAtomically } from '../../src/save-gate/apply-edit.js';
import {
	edgeRowToCyElement,
	type InspectorEdgeRow,
} from '../../src/inspector/edgeRowToCyElement.js';
import type { InspectorNodeRow } from '../../src/inspector/kernelRowToCyElement.js';

// kernel/dist/main.js — 7 levels up from this test file.
// Layout: <repo>/src/vs/goatide/extensions/goatide-bridge/test/integration/
const KERNEL_MAIN = path.resolve(__dirname, '../../../../../../../kernel/dist/main.js');
const KERNEL_GRAPH_MOD = path.resolve(__dirname, '../../../../../../../kernel/dist/graph/index.js');

/** 12-char SHA-256 fingerprint matching kernel/src/graph/repo-fingerprint.ts. */
function fp(remoteUrl: string): string {
	const normalized = remoteUrl.trim().toLowerCase().replace(/\.git$/, '').replace(/\/$/, '');
	return createHash('sha256').update(normalized).digest('hex').slice(0, 12);
}

const REPO_A_URL = 'https://github.com/x/repoA';
const REPO_B_URL = 'https://github.com/x/repoB';
const REPO_B_FINGERPRINT = fp(REPO_B_URL);

// Anchor file path that the diff will touch, matching the ConstraintNode seeded in repo-B.
// Use a relative path (no leading slash) so parsePatch + stripGitPrefix produces the correct
// match: `diff --git a/repoB/Constraint.md b/repoB/Constraint.md` -> newFileName = 'repoB/Constraint.md'.
const REPO_B_ANCHOR_FILE = 'repoB/Constraint.md';

describe('cross-repo-edge-activation: end-to-end Phase 16+17+21 chain', () => {
	let dbPath: string;
	let workDir: string;
	let kernel: KernelClient | undefined;
	let repoBConstraintNodeId: string;

	before(async function () {
		this.timeout(30_000);

		assert.ok(
			fs.existsSync(KERNEL_MAIN),
			`kernel main missing at ${KERNEL_MAIN} -- run npm --prefix ../../../../../../../kernel run build first`,
		);
		assert.ok(
			fs.existsSync(KERNEL_GRAPH_MOD),
			`kernel graph dist missing at ${KERNEL_GRAPH_MOD} -- run npm --prefix ../../../../../../../kernel run build first`,
		);

		dbPath = path.join(os.tmpdir(), `goatide-xrepo-${ulid()}.db`);
		workDir = path.join(os.tmpdir(), `goatide-xrepo-work-${ulid()}`);
		fs.mkdirSync(workDir, { recursive: true });

		// Step 1: Open the DB directly (no daemon yet) and raw-SQL seed a ConstraintNode
		// for repo-B with a non-'primary' repo_id. We use better-sqlite3 directly because
		// dao.seed() doesn't accept repo_id (v2.2 work per Open Decision Sec.3).
		// This is the canonical integration-test bypass pattern per dao.ts comment:
		// "Tests that need to bypass the DAO use better-sqlite3 directly".
		const graphModUrl = pathToFileURL(KERNEL_GRAPH_MOD).href;
		// Use `openDatabase` which returns { db (drizzle), sqlite (better-sqlite3 raw), close() }.
		// We access sqlite.$client or use the GraphDAO pattern from save-gate.test.ts.
		// Per dao.ts: "Tests that need to bypass the DAO use better-sqlite3 directly."
		const { openDatabase, GraphDAO } = await import(graphModUrl) as {
			openDatabase: (p: string) => {
				db: { $client: { prepare: (sql: string) => { run: (...args: unknown[]) => unknown; all: (...args: unknown[]) => unknown[] } } };
				sqlite: { prepare: (sql: string) => { run: (...args: unknown[]) => unknown; all: (...args: unknown[]) => unknown[] }; close: () => void };
				close: () => void;
			};
			GraphDAO: new (db: unknown) => { seed: (input: unknown) => { id: string } };
		};
		const handle = openDatabase(dbPath);

		// Raw-SQL INSERT via the raw sqlite handle: bypass dao.seed to write
		// repo_id = REPO_B_FINGERPRINT (column-level repo_id writes not in dao.seed per Open Decision Sec.3).
		repoBConstraintNodeId = ulid();
		const constraintPayload = JSON.stringify({
			kind: 'ConstraintNode',
			body: 'Cross-repo test constraint',
			anchor: { file: REPO_B_ANCHOR_FILE },
		});
		const ts = new Date().toISOString();

		// Access the raw sqlite handle either via handle.sqlite or handle.db.$client.
		const rawSqlite = handle.sqlite;
		rawSqlite.prepare(
			'INSERT INTO nodes (id, kind, payload, confidence, valid_from, recorded_at, repo_id)' +
			' VALUES (?, \'ConstraintNode\', ?, \'Explicit\', ?, ?, ?)'
		).run(repoBConstraintNodeId, constraintPayload, ts, ts, REPO_B_FINGERPRINT);

		rawSqlite.prepare(
			'INSERT INTO provenance (node_id, source, actor, recorded_at)' +
			' VALUES (?, \'test\', \'cross-repo-integration\', ?)'
		).run(repoBConstraintNodeId, ts);

		// Verify the INSERT worked before closing.
		const verifyRows = rawSqlite.prepare(
			`SELECT id, repo_id FROM nodes WHERE id = ?`
		).all(repoBConstraintNodeId) as Array<{ id: string; repo_id: string }>;
		assert.strictEqual(verifyRows.length, 1, `Raw SQL INSERT must have created 1 node row (got ${verifyRows.length})`);
		assert.strictEqual(verifyRows[0].repo_id, REPO_B_FINGERPRINT, `Raw SQL node must have repo_id = ${REPO_B_FINGERPRINT}`);

		handle.close();

		// Step 2: Start the kernel daemon against the same DB (now with repo-B node seeded).
		kernel = new KernelClient({ requestTimeoutMs: 10_000 });
		await kernel.connect(KERNEL_MAIN, dbPath);
	});

	after(async function () {
		this.timeout(10_000);
		try { kernel?.dispose(); } catch { /* ignore */ }
		// Give the spawned kernel a moment to release the DB file handle on Windows.
		await new Promise((r) => setTimeout(r, 200));
		try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
		try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
	});

	it('cross-repo-edge-activation: save in repoA citing repoB ConstraintNode produces cross-repo edge', async () => {
		assert.ok(kernel, 'kernel must be initialized in before()');

		// Step 3: proposeEdit with a diff that touches REPO_B_ANCHOR_FILE.
		// buildReceipt resolves anchors via queryByAnchor(repoId=undefined) = Path-B cross-repo,
		// so it finds the repo-B ConstraintNode even though it has a non-'primary' repo_id.
		const targetFile = path.join(workDir, 'main.ts');
		fs.writeFileSync(targetFile, 'const x = 1;', 'utf8');

		const diff = [
			`diff --git a/${REPO_B_ANCHOR_FILE} b/${REPO_B_ANCHOR_FILE}`,
			`--- a/${REPO_B_ANCHOR_FILE}`,
			`+++ b/${REPO_B_ANCHOR_FILE}`,
			'@@ -1,1 +1,2 @@',
			' # Constraint',
			'+## Updated',
		].join('\n');

		const proposeResult = await kernel.proposeEdit({
			diff,
			destructive: false,
			asOf: new Date().toISOString(),
		});
		// The receipt must cite the repo-B ConstraintNode (cross-repo anchor resolution).
		const receipt = proposeResult.receipt;
		const citedNodeId = receipt.citations[0]?.node_id ?? null;
		assert.strictEqual(
			citedNodeId,
			repoBConstraintNodeId,
			`cross-repo-edge-activation: proposeEdit receipt must cite repo-B ConstraintNode (got: ${citedNodeId})`,
		);

		// Step 4: atomicAccept -- creates an Attempt + 'references' edge dst=repoBConstraintNodeId.
		// In v2.1, the Attempt lands with repo_id='primary' (column-level repo_id write deferred
		// to v2.2 per Open Decision Sec.3). The repo_id flows in provenance.detail only.
		const applyResult = await applyEditAtomically({
			target_path: targetFile,
			new_content: 'const x = 1;\n// updated\n',
			change_id: receipt.change_id,
			receipt_id: receipt.id,
			tier: 'silent',
			accept_latency_ms: 0,
			body: 'cross-repo integration test accept',
			anchor: { file: targetFile },
		}, kernel);

		const attemptNodeId = applyResult.attempt_node_id;
		assert.match(attemptNodeId, /^[0-9A-HJKMNP-TV-Z]{26}$/, 'attempt_node_id must be a valid ULID');

		// Step 5: Query the edge + node rows from the kernel.
		const snapshot = await kernel.queryGraphSnapshot({ asOf: new Date().toISOString() });

		// Find the 'references' edge from Attempt -> repo-B ConstraintNode.
		const referencesEdge = snapshot.edges.find(
			(e) => e.src_id === attemptNodeId && e.dst_id === repoBConstraintNodeId && e.kind === 'references',
		);
		assert.ok(
			referencesEdge,
			`cross-repo-edge-activation: 'references' edge from Attempt(${attemptNodeId}) to ConstraintNode(${repoBConstraintNodeId}) must exist`,
		);

		// Find the src + dst node rows to build the nodesById map.
		const attemptNode = snapshot.nodes.find((n) => n.node_id === attemptNodeId);
		const constraintNode = snapshot.nodes.find((n) => n.node_id === repoBConstraintNodeId);
		assert.ok(attemptNode, `cross-repo-edge-activation: Attempt node ${attemptNodeId} must be in snapshot`);
		assert.ok(constraintNode, `cross-repo-edge-activation: ConstraintNode ${repoBConstraintNodeId} must be in snapshot`);

		// Step 6: Assert dst.repo_id = REPO_B_FINGERPRINT (the raw-SQL seed value).
		assert.strictEqual(
			constraintNode.repo_id,
			REPO_B_FINGERPRINT,
			`cross-repo-edge-activation: ConstraintNode must have repo_id = REPO_B_FINGERPRINT (${REPO_B_FINGERPRINT})`,
		);

		// In v2.1, the Attempt has repo_id='primary' (column-level repo_id write is v2.2 work).
		// This is the known limitation documented in Open Decision Sec.3. The cross-repo detection
		// still fires because primary !== REPO_B_FINGERPRINT.
		assert.notStrictEqual(
			attemptNode.repo_id,
			constraintNode.repo_id,
			'cross-repo-edge-activation: src and dst must have different repo_ids (cross-repo condition)',
		);

		// Step 7: Render via edgeRowToCyElement -- proves Phase 17 crossRepo detection fires.
		const srcNode: InspectorNodeRow = {
			id: attemptNode.node_id,
			kind: attemptNode.kind as InspectorNodeRow['kind'],
			label: '',
			valid_from: attemptNode.valid_from,
			invalidated_at: attemptNode.invalidated_at ?? null,
			repo_id: attemptNode.repo_id,
		};
		const dstNode: InspectorNodeRow = {
			id: constraintNode.node_id,
			kind: constraintNode.kind as InspectorNodeRow['kind'],
			label: '',
			valid_from: constraintNode.valid_from,
			invalidated_at: constraintNode.invalidated_at ?? null,
			repo_id: constraintNode.repo_id,
		};
		const edgeRow: InspectorEdgeRow = {
			id: referencesEdge.edge_id,
			kind: referencesEdge.kind,
			src_id: referencesEdge.src_id,
			dst_id: referencesEdge.dst_id,
			valid_from: referencesEdge.valid_from,
			invalidated_at: referencesEdge.invalidated_at ?? null,
			repo_id: referencesEdge.repo_id,
		};
		const nodesById = new Map<string, InspectorNodeRow>([
			[srcNode.id, srcNode],
			[dstNode.id, dstNode],
		]);
		const cyEdge = edgeRowToCyElement(edgeRow, nodesById);

		// Step 8: Assert data.crossRepo === true (Phase 17 dormant selector now fires on real data).
		assert.strictEqual(
			cyEdge.data.crossRepo,
			true,
			`cross-repo-edge-activation: edgeRowToCyElement must produce data.crossRepo === true when src.repo_id ('${srcNode.repo_id}') !== dst.repo_id ('${dstNode.repo_id}')`,
		);
	});

	it('cross-repo-edge-activation: same-repo edge has data.crossRepo === false (negative control)', async () => {
		assert.ok(kernel, 'kernel must be initialized in before()');

		// Seed a primary-repo ConstraintNode via proposeEdit (regular path, no raw SQL).
		// The resulting Attempt and its ConstraintNode citation will both have repo_id='primary'.
		const targetFile2 = path.join(workDir, 'auth.ts');
		fs.writeFileSync(targetFile2, 'const auth = true;', 'utf8');

		// Seed the anchor node via direct seeding before proposing.
		// Use the kernel's queryGraphSnapshot to find a primary node, or just seed a new one.
		// Simplest: use a diff that touches a file with NO matching ConstraintNode, so
		// citations[] is empty. The Attempt still gets created. Without a citation, no edge
		// is written -- so test crossRepo=false directly on a same-repo fixture.
		// Instead, use the node from the main test case for the src and duplicate with primary dst.
		const sameRepoSrcNode: InspectorNodeRow = {
			id: 'same-src',
			kind: 'Attempt',
			label: '',
			valid_from: new Date().toISOString(),
			invalidated_at: null,
			repo_id: 'primary',
		};
		const sameRepoDstNode: InspectorNodeRow = {
			id: 'same-dst',
			kind: 'ConstraintNode',
			label: '',
			valid_from: new Date().toISOString(),
			invalidated_at: null,
			repo_id: 'primary', // same repo as src
		};
		const sameRepoEdge: InspectorEdgeRow = {
			id: 'same-edge',
			kind: 'references',
			src_id: 'same-src',
			dst_id: 'same-dst',
			valid_from: new Date().toISOString(),
			invalidated_at: null,
			repo_id: 'primary',
		};
		const sameRepoNodesById = new Map<string, InspectorNodeRow>([
			[sameRepoSrcNode.id, sameRepoSrcNode],
			[sameRepoDstNode.id, sameRepoDstNode],
		]);
		const sameRepoCyEdge = edgeRowToCyElement(sameRepoEdge, sameRepoNodesById);
		assert.strictEqual(
			sameRepoCyEdge.data.crossRepo,
			false,
			'cross-repo-edge-activation negative control: same-repo edge must have data.crossRepo === false',
		);
	});
});
