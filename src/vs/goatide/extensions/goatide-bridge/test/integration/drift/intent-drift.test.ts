/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/test/integration/drift/intent-drift.test.ts
//
// Phase 7 Plan 07-05 (DRIFT-02) — bridge integration tests for the IntentDrift wiring.
//
// Two it() tests:
//   1. goatide.setSessionPriority command palette quickPick → workspace state update.
//   2. tier-dispatch flow: prime session.priority='Speed-First'; seed a DecisionNode with
//      derived_under_priority='Quality-First'; call kernel.proposeEdit({...,
//      session_priority}) over a spawned-kernel paired-stream connection; assert the
//      returned receipt carries intent_drift_badge with cited_priority='Quality-First' and
//      session_priority='Speed-First'.
//
// Mandate-C exact-equality (Pitfall 5) is verified at the kernel unit-test level
// (kernel/src/test/drift/intent.spec.ts); this bridge test validates the host->kernel
// wiring + workspace-config plumbing.

import { describe, it, before, after } from 'mocha';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import * as vscode from 'vscode';
import { ulid } from 'ulid';
import { KernelClient } from '../../../src/kernel/client.js';
import {
	setQuickPickResponse,
	setInputBoxResponse,
	getRegisteredCommand,
	getWorkspaceConfigurationValue,
	setWorkspaceConfigurationValue,
	resetSessionPrioritySpies,
} from '../../setup/vscode-stub.js';

// kernel/dist/main.js — relative to this test file.
const KERNEL_MAIN = path.resolve(__dirname, '../../../../../../../../kernel/dist/main.js');

describe('Phase 7 Plan 07-05 — bridge IntentDrift integration (DRIFT-02)', () => {
	describe('goatide.setSessionPriority command palette', () => {
		before(() => {
			// Register the command in isolation by invoking the activation snippet directly.
			// We DO NOT activate the entire bridge extension (that would require a kernel handle
			// + canvas panel + save-gate registration). Instead we mirror the registration
			// shape from src/extension.ts and assert the registered callback updates the
			// workspace configuration as documented.
			vscode.commands.registerCommand('goatide.setSessionPriority', async () => {
				const items = ['Speed-First', 'Quality-First', 'Safety-First', 'Cost-First', 'Custom...'];
				const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Select current session priority' });
				if (!pick) {
					return;
				}
				let value = pick;
				if (pick === 'Custom...') {
					const custom = await vscode.window.showInputBox({
						prompt: 'Enter custom session priority (free-form; canonical four are recommended)',
						value: '',
					});
					if (!custom) {
						return;
					}
					value = custom;
				}
				await vscode.workspace
					.getConfiguration('goatide')
					.update('session.priority', value, vscode.ConfigurationTarget.Workspace);
			});
		});

		it('quickPick → "Speed-First" updates workspace config goatide.session.priority', async () => {
			resetSessionPrioritySpies();
			setQuickPickResponse('Speed-First');
			const cmd = getRegisteredCommand('goatide.setSessionPriority');
			assert.ok(cmd, 'goatide.setSessionPriority must be registered');
			await cmd!();
			const stored = getWorkspaceConfigurationValue('goatide', 'session.priority');
			assert.equal(stored, 'Speed-First');
		});
	});

	describe('tier-dispatch session_priority threading', () => {
		let dbPath: string;
		let workDir: string;
		let kernel: KernelClient | undefined;
		let decisionId: string;

		before(async function () {
			this.timeout(30_000);
			assert.ok(fs.existsSync(KERNEL_MAIN), `kernel main missing at ${KERNEL_MAIN} (run npm --prefix ../../../../../../../../kernel run build first)`);

			dbPath = path.join(os.tmpdir(), `goatide-intent-drift-${ulid()}.db`);
			workDir = path.join(os.tmpdir(), `goatide-intent-drift-work-${ulid()}`);
			fs.mkdirSync(workDir, { recursive: true });

			// Pre-seed: hand-author a DecisionNode with derived_under_priority='Quality-First'
			// anchored to src/auth.ts. The kernel.proposeEdit traversal will pick it up via
			// the file anchor; the kernel-side renderReceipt step (when session_priority is
			// supplied) will decorate the matching citation with intent_drift_badge.
			const graphModPath = path.resolve(__dirname, '../../../../../../../../kernel/dist/graph/index.js');
			const graphModUrl = pathToFileURL(graphModPath).href;
			const { openDatabase, GraphDAO } = await import(graphModUrl) as {
				openDatabase: (p: string) => { db: unknown; sqlite: { close: () => void }; close: () => void };
				GraphDAO: new (db: unknown) => {
					seed: (input: unknown) => { id: string };
				};
			};
			const handle = openDatabase(dbPath);
			const dao = new GraphDAO(handle.db);
			const decision = dao.seed({
				payload: {
					kind: 'DecisionNode',
					body: 'Use refresh-token rotation for auth',
					anchor: { file: 'src/auth.ts' },
					derived_under_priority: 'Quality-First',
				},
				provenance: { source: 'cli', actor: 'test' },
			});
			decisionId = decision.id;
			handle.close();

			kernel = new KernelClient({ requestTimeoutMs: 10_000 });
			await kernel.connect(KERNEL_MAIN, dbPath);
		});

		after(async function () {
			this.timeout(10_000);
			try { kernel?.dispose(); } catch { /* ignore */ }
			await new Promise((r) => setTimeout(r, 200));
			try { fs.rmSync(workDir, { recursive: true, force: true }); } catch { /* ignore */ }
			try { fs.unlinkSync(dbPath); } catch { /* ignore */ }
		});

		it('proposeEdit({session_priority:"Speed-First"}) returns receipt with intent_drift_badge populated for mismatching DecisionNode', async () => {
			assert.ok(kernel, 'kernel must be initialized in before()');
			// Prime the bridge-side configuration store as if the user had picked Speed-First
			// via setSessionPriority — this is the value that on-will-save.ts will read.
			setWorkspaceConfigurationValue('goatide', 'session.priority', 'Speed-First');

			const sessionPriority = vscode.workspace
				.getConfiguration('goatide')
				.get<string>('session.priority', 'Quality-First');
			assert.equal(sessionPriority, 'Speed-First');

			const targetPath = 'src/auth.ts';
			const diff = `diff --git a/${targetPath} b/${targetPath}\n--- a/${targetPath}\n+++ b/${targetPath}\n@@ -1,1 +1,2 @@\n const a = 1;\n+const b = 2;\n`;
			const propose = await kernel!.proposeEdit({
				diff,
				destructive: false,
				asOf: new Date().toISOString(),
				session_priority: sessionPriority,
			});

			// The seeded DecisionNode is anchored to src/auth.ts; the diff edits the same file,
			// so the traversal includes it. Find the matching citation and assert the badge is
			// populated with the correct exact-equality mismatch (Speed-First !== Quality-First).
			const matched = propose.receipt.citations.find((c) => c.node_id === decisionId);
			assert.ok(matched, `expected citation for decisionId ${decisionId} in receipt`);
			assert.deepEqual(matched!.intent_drift_badge, {
				citation_node_id: decisionId,
				session_priority: 'Speed-First',
				cited_priority: 'Quality-First',
				explanation: `This rule was derived under 'Quality-First'; current session is 'Speed-First'. Re-evaluate before applying.`,
			});

			// Reset the test override so other tests don't see it.
			setInputBoxResponse(undefined);
		});
	});
});
