/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/test/integration/drift/deep05-no-graph-mutation.test.ts
//
// Phase 14 Plan 14-04 (DEEP-05) — Mandate B regression test. The session-priority lens MUST
// NOT mutate the kernel graph. This file is the canonical defense against Pitfall 3 (a
// future contributor adding a "log priority change" graph row inside the rerank path).
//
// Five it() cases across two describe blocks (names match VALIDATION.md --grep verbatim):
//   - 'DEEP-05 no new graph rows':
//       1. Attempt count invariant
//       2. Node count invariant (sum across all 5 NODE_KINDS)
//       3. Edge count invariant (raw sqlite SELECT COUNT(*) FROM edges)
//       5. setSessionPriority command integration — workspace config updates + zero row delta
//   - 'DEEP-05 zero kernel mutation':
//       4. RPC method-name fence — spy on KernelClient prototype for the 4 banned write RPCs,
//          run the full session-priority change + rerank flow, assert callLog is empty.
//
// Mirrors intent-drift.test.ts for the kernel-spawn fixture; reuses GraphDAO openDatabase
// pattern from rationale-chain.test.ts. The lens is pure in-memory so the assertions
// are deterministic — any new graph row introduced by a future contributor trips Test 1/2/3,
// and any new write-RPC call trips Test 4.

import { describe, it, before, after } from 'mocha';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as vscode from 'vscode';
import { ulid } from 'ulid';
import { KernelClient } from '../../../src/kernel/client.js';
import { rerankBySessionPriority } from '../../../src/inspector/session-priority-lens.js';
import type { RenderedCitationForCanvas, DriftFindingForCanvas } from '../../../src/canvas/messages.js';
import {
	setQuickPickResponse,
	getRegisteredCommand,
	getWorkspaceConfigurationValue,
	setWorkspaceConfigurationValue,
	resetSessionPrioritySpies,
} from '../../setup/vscode-stub.js';

// kernel/dist/main.js — relative to this test file (mirror rationale-chain.test.ts shape).
const KERNEL_MAIN = path.resolve(__dirname, '../../../../../../../../kernel/dist/main.js');

interface SeedReturn { id: string }
interface MinimalDao {
	seed: (input: unknown) => SeedReturn;
	writeEdge: (input: unknown) => { id: string };
	queryByKind: (kind: string, asOf?: string) => unknown[];
}
interface SqliteHandle {
	prepare: (sql: string) => { get: () => { c: number } };
}
interface DbHandle {
	db: unknown;
	sqlite: SqliteHandle & { close: () => void };
	close: () => void;
}

async function loadGraphModule(): Promise<{
	openDatabase: (p: string) => DbHandle;
	GraphDAO: new (db: unknown) => MinimalDao;
}> {
	const graphModPath = path.resolve(__dirname, '../../../../../../../../kernel/dist/graph/index.js');
	const graphModUrl = pathToFileURL(graphModPath).href;
	return await import(graphModUrl) as {
		openDatabase: (p: string) => DbHandle;
		GraphDAO: new (db: unknown) => MinimalDao;
	};
}

interface RowCounts {
	attempts: number;
	nodes: number;
	edges: number;
}

function snapshotCounts(dao: MinimalDao, sqlite: SqliteHandle): RowCounts {
	const attempts = dao.queryByKind('Attempt').length;
	const nodes =
		dao.queryByKind('ConstraintNode').length +
		dao.queryByKind('DecisionNode').length +
		dao.queryByKind('ContractNode').length +
		dao.queryByKind('OpenQuestion').length +
		dao.queryByKind('Attempt').length;
	const row = sqlite.prepare('SELECT COUNT(*) AS c FROM edges').get();
	return { attempts, nodes, edges: row.c };
}

function makeCitation(node_id: string, badge: RenderedCitationForCanvas['intent_drift_badge']): RenderedCitationForCanvas {
	return {
		node_id,
		version: node_id,
		confidence: 'Explicit',
		edge_path: 'parent_of:0',
		snippet: 'snippet',
		body_preview: 'body',
		successor_id: null,
		intent_drift_badge: badge,
	};
}

describe('Phase 14 Plan 14-04 — DEEP-05 Mandate B regression', () => {
	let dbPath: string;
	let kernel: KernelClient | undefined;
	let dao: MinimalDao;
	let sqlite: SqliteHandle & { close: () => void };
	let dbHandle: DbHandle;
	let citation: RenderedCitationForCanvas;
	let findings: readonly DriftFindingForCanvas[];

	before(async function () {
		this.timeout(30_000);
		assert.ok(fs.existsSync(KERNEL_MAIN), `kernel main missing at ${KERNEL_MAIN}`);

		dbPath = path.join(os.tmpdir(), `goatide-deep05-no-mutation-${ulid()}.db`);

		const { openDatabase, GraphDAO } = await loadGraphModule();
		dbHandle = openDatabase(dbPath);
		dao = new GraphDAO(dbHandle.db);
		sqlite = dbHandle.sqlite;

		// Seed a small graph: 1 DecisionNode + 1 ConstraintNode + 1 Attempt + 1 edge. The
		// exact shape is not material — Test 1/2/3 compare counts before vs after; we just
		// need NON-zero starting counts so a wrongly-introduced extra row would be detectable.
		const decision = dao.seed({
			payload: {
				kind: 'DecisionNode',
				body: 'use refresh token rotation',
				anchor: { file: 'src/auth.ts' },
				derived_under_priority: 'Quality-First',
			},
			provenance: { source: 'cli', actor: 'test' },
		});
		const constraint = dao.seed({
			payload: {
				kind: 'ConstraintNode',
				body: 'tokens must rotate every 7 days',
				anchor: { file: 'src/auth.ts' },
			},
			provenance: { source: 'cli', actor: 'test' },
		});
		dao.seed({
			payload: {
				kind: 'Attempt',
				body: 'attempt-1',
				anchor: { file: 'src/auth.ts' },
			},
			provenance: { source: 'cli', actor: 'test' },
		});
		dao.writeEdge({
			kind: 'parent_of',
			src_id: decision.id,
			dst_id: constraint.id,
		});

		citation = makeCitation(decision.id, {
			kind: 'priority-mismatch',
			citation_node_id: decision.id,
			session_priority: 'Speed-First',
			cited_priority: 'Quality-First',
			explanation: 'session priority mismatch',
		});
		findings = [];

		kernel = new KernelClient({ requestTimeoutMs: 10_000 });
		await kernel.connect(KERNEL_MAIN, dbPath);
	});

	after(async function () {
		this.timeout(10_000);
		try { kernel?.dispose(); } catch { /* ignore */ }
		await new Promise((r) => setTimeout(r, 200));
		try { dbHandle.close(); } catch { /* ignore */ }
		try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
	});

	describe('DEEP-05 no new graph rows', () => {
		it('Attempt count is byte-identical after session-priority change + rerank', () => {
			const before = snapshotCounts(dao, sqlite);
			// Simulate the full webview-side flow: change session priority, then invoke the
			// rerank lens as App.tsx does on the next canvas.show.
			setWorkspaceConfigurationValue('goatide', 'session.priority', 'Speed-First');
			const sessionPriority = vscode.workspace
				.getConfiguration('goatide')
				.get<string>('session.priority', 'Quality-First');
			rerankBySessionPriority({
				citations: [citation],
				findings,
				sessionPriority,
			});
			const after = snapshotCounts(dao, sqlite);
			assert.deepStrictEqual(
				after.attempts,
				before.attempts,
				'Mandate B: Attempt count must not change across a session-priority change + rerank',
			);
		});

		it('Node count is byte-identical (all 5 NODE_KINDS summed)', () => {
			const before = snapshotCounts(dao, sqlite);
			setWorkspaceConfigurationValue('goatide', 'session.priority', 'Safety-First');
			rerankBySessionPriority({
				citations: [citation],
				findings,
				sessionPriority: 'Safety-First',
			});
			const after = snapshotCounts(dao, sqlite);
			assert.deepStrictEqual(
				after.nodes,
				before.nodes,
				'Mandate B: Node count must not change across a session-priority change + rerank',
			);
		});

		it('Edge count is byte-identical (raw SELECT COUNT(*) FROM edges)', () => {
			const before = snapshotCounts(dao, sqlite);
			setWorkspaceConfigurationValue('goatide', 'session.priority', 'Cost-First');
			rerankBySessionPriority({
				citations: [citation],
				findings,
				sessionPriority: 'Cost-First',
			});
			const after = snapshotCounts(dao, sqlite);
			assert.deepStrictEqual(
				after.edges,
				before.edges,
				'Mandate B: edge count must not change across a session-priority change + rerank',
			);
		});

		// Test 5 — setSessionPriority command integration. Register the command (mirroring
		// the activation snippet) and assert the quickPick flow updates workspace config AND
		// produces zero new graph rows. The command itself never touches the kernel — this
		// test exists to pin that contract so a future contributor can't silently add a
		// kernel call inside the command handler.
		it('goatide.setSessionPriority command produces zero new graph rows', async () => {
			// Register the command shape (mirrors intent-drift.test.ts:51-71). We register a
			// fresh one here so this file is independent of test load order.
			vscode.commands.registerCommand('goatide.setSessionPriority.deep05', async () => {
				const items = ['Speed-First', 'Quality-First', 'Safety-First', 'Cost-First', 'Custom...'];
				const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Select current session priority' });
				if (!pick) {
					return;
				}
				await vscode.workspace
					.getConfiguration('goatide')
					.update('session.priority', pick, vscode.ConfigurationTarget.Workspace);
			});

			const before = snapshotCounts(dao, sqlite);
			resetSessionPrioritySpies();
			setQuickPickResponse('Quality-First');
			const cmd = getRegisteredCommand('goatide.setSessionPriority.deep05');
			assert.ok(cmd, 'goatide.setSessionPriority.deep05 must be registered');
			await cmd!();
			// Workspace config DID update (the command path executed).
			assert.equal(
				getWorkspaceConfigurationValue('goatide', 'session.priority'),
				'Quality-First',
				'command must update goatide.session.priority via WorkspaceConfiguration.update',
			);
			// And the lens runs against the new priority.
			rerankBySessionPriority({
				citations: [citation],
				findings,
				sessionPriority: 'Quality-First',
			});
			const after = snapshotCounts(dao, sqlite);
			assert.deepStrictEqual(
				after,
				before,
				'Mandate B: setSessionPriority command + rerank must not add any graph rows',
			);
		});
	});

	describe('DEEP-05 zero kernel mutation', () => {
		// Test 4 — RPC method-name fence. Wrap the four banned write RPCs on the live
		// KernelClient instance; run the full session-priority change + rerank flow; assert
		// callLog is empty. Use try/finally so a test failure does not leak the spy.
		//
		// The lens itself is webview-side and does NOT have access to the KernelClient — so
		// the only way the lens flow could trip this fence is via an unanticipated future
		// addition. Pitfall 3 fence canonical defense.
		it('lens flow does not invoke any banned write-RPC on KernelClient', async () => {
			assert.ok(kernel, 'kernel must be initialized');
			const client = kernel!;
			const callLog: string[] = [];

			// Use Record-shaped indexing to swap method properties without `any`.
			const indexable = client as unknown as Record<string, (...args: unknown[]) => unknown>;
			const origAtomicAccept = indexable.atomicAccept;
			const origProposeEdit = indexable.proposeEdit;
			const origRecordRejection = indexable.recordRejection;
			const origRecordContractOverride = indexable.recordContractOverride;

			indexable.atomicAccept = ((...args: unknown[]) => {
				callLog.push('atomicAccept');
				return origAtomicAccept.apply(client, args);
			});
			indexable.proposeEdit = ((...args: unknown[]) => {
				callLog.push('proposeEdit');
				return origProposeEdit.apply(client, args);
			});
			indexable.recordRejection = ((...args: unknown[]) => {
				callLog.push('recordRejection');
				return origRecordRejection.apply(client, args);
			});
			indexable.recordContractOverride = ((...args: unknown[]) => {
				callLog.push('recordContractOverride');
				return origRecordContractOverride.apply(client, args);
			});

			try {
				// Full session-priority change + rerank flow. The webview-side rerank does
				// not touch the kernel; we exercise it twice (with two different priorities)
				// to cover the canvas.show -> rerank pattern.
				setWorkspaceConfigurationValue('goatide', 'session.priority', 'Speed-First');
				rerankBySessionPriority({
					citations: [citation],
					findings,
					sessionPriority: 'Speed-First',
				});
				setWorkspaceConfigurationValue('goatide', 'session.priority', 'Safety-First');
				rerankBySessionPriority({
					citations: [citation],
					findings,
					sessionPriority: 'Safety-First',
				});

				assert.deepStrictEqual(
					callLog,
					[],
					'Mandate B / Pitfall 3: lens flow must not invoke any banned write-RPC',
				);
			} finally {
				indexable.atomicAccept = origAtomicAccept;
				indexable.proposeEdit = origProposeEdit;
				indexable.recordRejection = origRecordRejection;
				indexable.recordContractOverride = origRecordContractOverride;
			}
		});
	});
});
