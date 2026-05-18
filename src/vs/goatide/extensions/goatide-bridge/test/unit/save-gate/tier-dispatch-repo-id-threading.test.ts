/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/save-gate/tier-dispatch-repo-id-threading.test.ts -- Phase 21 Plan 21-01.
//
// RED stub. Three cases covering XREPO-02c/d/e:
// (a) 'tier-dispatch recordRejection threads repo_id from DispatchInputs' -- dispatchTier
//     on the modal-reject path calls kernel.recordRejection with the repo_id from DispatchInputs.
// (b) 'applyEditAtomically threads repo_id into atomicAccept call' -- the accept path calls
//     kernel.atomicAccept with the repo_id forwarded from the caller's inputs.
// (c) 'on-will-save handleProposedSave threads repo_id into proposeEdit call' -- on-will-save
//     calls kernel.proposeEdit with repo_id resolved from WorkspaceRepoState.getActiveRepoId.
//
// Today (Wave 0): DispatchInputs.repo_id field does not exist; AcceptParams.repo_id does not
// exist; proposeEdit call in on-will-save does not resolve repo_id. All 3 tests FAIL because
// the spy records undefined for the repo_id argument.
//
// GREEN after Plan 21-02 wires:
//   1. DispatchInputs.repo_id?: string field
//   2. tier-dispatch.ts threads DispatchInputs.repo_id into recordRejection + atomicAccept args
//   3. on-will-save.ts resolves WorkspaceRepoState.getActiveRepoId(event.document.uri) and
//      passes it to proposeEdit
//
// Grep alignment:
//   'tier-dispatch.*recordRejection.*repo_id'
//   'applyEditAtomically.*repo_id'
//   'on-will-save.*proposeEdit.*repo_id'
//
// Spy pattern: stash & restore kernel methods; capture call args (mirrors mandate-d test pattern).

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import * as vscode from 'vscode';

// Helper to build a minimal canvas module mock (mirrors mandate-d-destructive-no-hover.test.ts).
async function buildMockCanvasMod(tier: 'silent' | 'inline' | 'modal', isDestructive: boolean) {
	const { __setCanvasModuleForTests } = await import('../../../src/save-gate/canvas-module.js');
	const mockMod = {
		classifyTier: () => tier,
		detectDestructive: () => isDestructive,
		destructiveVerbForConfirmation: () => 'delete',
		DEFAULT_HIGH_IMPACT_CONTRACT_PREFIXES: [] as readonly string[],
		AnchorResultCache: class {
			get(_key: string): readonly unknown[] | undefined { return undefined; }
			set(_key: string, _val: readonly unknown[]): void { }
			invalidateByAnchorPath(_p: string): number { return 0; }
			clear(): void { }
			size(): number { return 0; }
		},
		DEFAULT_MAX_ENTRIES: 100,
		DEFAULT_TTL_MS: 60000,
	};
	__setCanvasModuleForTests(mockMod as unknown as Parameters<typeof __setCanvasModuleForTests>[0]);
}

/** Build a minimal DispatchInputs-shaped object with a mocked kernel that spies on RPC calls. */
function buildDispatchInputs(opts: {
	tier: 'silent' | 'inline' | 'modal';
	isDestructive: boolean;
	repoId?: string;
	onRecordRejection?: (args: unknown) => void;
	onAtomicAccept?: (args: unknown) => void;
}) {
	const kernel = {
		queryNodes: async () => ({ nodes: [] }),
		atomicAccept: async (...args: unknown[]) => {
			if (opts.onAtomicAccept) { opts.onAtomicAccept(args[0]); }
			return { attempt_node_id: 'test-attempt-node' };
		},
		proposeEdit: async () => {
			return {
				receipt: {
					id: 'test-receipt-id',
					change_id: 'test-change-id',
					citations: [],
					graph_snapshot_tx_time: null,
					drill_chain: [],
				},
			};
		},
		recordRejection: async (...args: unknown[]) => {
			if (opts.onRecordRejection) { opts.onRecordRejection(args[0]); }
			return { open_question_id: 'test-oq-id' };
		},
		recordContractOverride: async () => ({ attempt_node_id: 'test-override' }),
		onDriftProgress: () => () => { },
		runRippleProgressive: async () => ({
			report: {
				contract_node_id: '',
				max_hops: 1,
				definitely_affected: [],
				potentially_affected: [],
				truncated: false,
				generated_at: '',
			},
		}),
		isConnected: () => true,
	};

	const panel = {
		showAndAwait: async () => {
			// Simulate modal reject path for threading test (a)
			return { kind: 'reject', note: 'test rejection note' };
		},
		registerOverrideHandler: () => { },
		registerRationaleHandler: () => { },
		dispose: async () => { },
		postComplianceReportPartial: async () => { },
		postComplianceReportFull: async () => { },
	};

	const docUri = vscode.Uri.file('/tmp/tier-dispatch-repo-id-test.ts');
	const doc = {
		uri: docUri,
		getText: () => '',
		fileName: '/tmp/tier-dispatch-repo-id-test.ts',
		languageId: 'typescript',
		version: 1,
		isDirty: false,
		isUntitled: false,
		isClosed: false,
		save: async () => true,
		lineCount: 1,
		eol: 1,
	};

	const inputs = {
		kernel,
		panel,
		doc,
		original: '',
		modified: '// change',
		diff: '+// change',
		receipt: {
			id: 'test-receipt-id',
			change_id: 'test-change-id',
			citations: [],
			graph_snapshot_tx_time: null,
			drill_chain: [],
		},
		startMs: Date.now(),
		driftFindings: [],
		lockTrigger: null,
		// repo_id: opts.repoId -- Plan 21-02 adds this field to DispatchInputs.
		// Cast via unknown to allow the forward-compat sentinel.
		...(opts.repoId !== undefined ? { repo_id: opts.repoId } : {}),
	};

	return { inputs: inputs as unknown, kernel, panel };
}

describe('Phase 21 XREPO-02c/d/e -- tier-dispatch + apply-edit + on-will-save repo_id threading (RED stub)', () => {

	it('tier-dispatch recordRejection threads repo_id from DispatchInputs', async () => {
		const { dispatchTier } = await import('../../../src/save-gate/tier-dispatch.js');
		const { __resetCanvasModuleForTests } = await import('../../../src/save-gate/canvas-module.js');

		// tier='modal', isDestructive=false -> showAndAwait is called; panel returns {kind:'reject', note:...}
		await buildMockCanvasMod('modal', false);

		// Override config to avoid highImpact=confirm blocking (modal non-destructive defaults to confirm)
		const origGetConfig = vscode.workspace.getConfiguration.bind(vscode.workspace);
		const fakeConfig = {
			get: (key: string, defaultValue?: unknown) => {
				if (key === 'benign') { return 'modal'; }
				if (key === 'destructive') { return 'confirm'; }
				if (key === 'highImpact') { return 'confirm'; }
				return defaultValue;
			},
			has: (_k: string) => false,
			inspect: (_k: string) => undefined,
			update: async () => { },
		} as unknown as vscode.WorkspaceConfiguration;
		(vscode.workspace as unknown as Record<string, unknown>)['getConfiguration'] = (section: unknown) => {
			if (section === 'goatide.saveGate') { return fakeConfig; }
			return origGetConfig(section as string);
		};

		let recordRejectionArgs: unknown = undefined;
		const { inputs } = buildDispatchInputs({
			tier: 'modal',
			isDestructive: false,
			repoId: 'testrepofingerprint',
			onRecordRejection: (args) => { recordRejectionArgs = args; },
		});

		try {
			await dispatchTier(inputs as Parameters<typeof dispatchTier>[0]);
		} catch {
			// Some paths throw (e.g. applyEditAtomically on file-not-found); ignore.
		} finally {
			(vscode.workspace as unknown as Record<string, unknown>)['getConfiguration'] = origGetConfig;
			__resetCanvasModuleForTests();
		}

		// RED today: DispatchInputs.repo_id doesn't exist; recordRejection args lack repo_id.
		// GREEN after Plan 21-02 threads DispatchInputs.repo_id into the recordRejection call args.
		const argsObj = recordRejectionArgs as Record<string, unknown> | undefined;
		assert.strictEqual(
			argsObj?.['repo_id'],
			'testrepofingerprint',
			'tier-dispatch.*recordRejection.*repo_id: expected repo_id to be threaded from DispatchInputs',
		);
	});

	it('applyEditAtomically threads repo_id into atomicAccept call', async () => {
		const { applyEditAtomically } = await import('../../../src/save-gate/apply-edit.js');

		let atomicAcceptArgs: unknown = undefined;
		const kernel = {
			atomicAccept: async (...args: unknown[]) => {
				atomicAcceptArgs = args[0];
				return { attempt_node_id: 'test-attempt-node' };
			},
		} as unknown;

		// AcceptParams currently has no repo_id field; cast via unknown.
		const acceptParams = {
			target_path: '/tmp/test-apply-edit.ts',
			new_content: '// new content',
			change_id: 'test-change-id',
			receipt_id: 'test-receipt-id',
			tier: 'silent' as const,
			accept_latency_ms: 0,
			body: 'accepted silent save',
			anchor: { file: '/tmp/test-apply-edit.ts' },
			repo_id: 'testrepofingerprint', // Plan 21-02 adds this to AcceptParams.
		} as unknown as import('../../../src/save-gate/apply-edit.js').AcceptParams;

		try {
			await applyEditAtomically(acceptParams, kernel as Parameters<typeof applyEditAtomically>[1]);
		} catch {
			// File doesn't exist; applyEditAtomically may throw on fs ops. Ignore.
		}

		// RED today: AcceptParams.repo_id doesn't exist; atomicAccept call args lack repo_id.
		// GREEN after Plan 21-02 adds repo_id to AcceptParams and threads it into the call.
		const argsObj = atomicAcceptArgs as Record<string, unknown> | undefined;
		assert.strictEqual(
			argsObj?.['repo_id'],
			'testrepofingerprint',
			'applyEditAtomically.*repo_id: expected repo_id to be threaded into atomicAccept args',
		);
	});

	it('on-will-save handleProposedSave threads repo_id into proposeEdit call', async () => {
		// This test stubs WorkspaceRepoState.getActiveRepoId to return 'testrepofingerprint'
		// and asserts kernel.proposeEdit is called with repo_id: 'testrepofingerprint'.
		//
		// RED today: on-will-save does not call WorkspaceRepoState.getActiveRepoId; proposeEdit
		// call args lack repo_id. GREEN after Plan 21-02 wires the resolution.

		// Stub WorkspaceRepoState.getActiveRepoId to return the test fingerprint.
		const wsrStateModule = await import('../../../src/save-gate/workspace-repo-state.js');
		const origGetActiveRepoId = wsrStateModule.WorkspaceRepoState.getActiveRepoId.bind(wsrStateModule.WorkspaceRepoState);
		(wsrStateModule.WorkspaceRepoState as unknown as Record<string, unknown>)['getActiveRepoId'] = async (_uri: vscode.Uri) => 'testrepofingerprint';

		let proposeEditArgs: unknown = undefined;
		const kernel = {
			proposeEdit: async (...args: unknown[]) => {
				proposeEditArgs = args[0];
				return {
					receipt: {
						id: 'test-receipt-id',
						change_id: 'test-change-id',
						citations: [],
						graph_snapshot_tx_time: null,
						drill_chain: [],
					},
				};
			},
			queryNodes: async () => ({ nodes: [] }),
		} as unknown;

		try {
			const { handleProposedSave } = await import('../../../src/save-gate/on-will-save.js');

			// Build a minimal WillSaveTextDocumentEvent-shaped object.
			const docUri = vscode.Uri.file('/tmp/on-will-save-repo-id-test.ts');
			const mockEvent = {
				document: {
					uri: docUri,
					getText: () => '// original',
					fileName: '/tmp/on-will-save-repo-id-test.ts',
					languageId: 'typescript',
					version: 1,
					isDirty: true,
					isUntitled: false,
					isClosed: false,
					save: async () => true,
					lineCount: 1,
					eol: 1,
				} as unknown as vscode.TextDocument,
				reason: vscode.TextDocumentSaveReason.Manual,
				waitUntil: (_thennable: Promise<unknown>) => { /* no-op */ },
			} as unknown as vscode.TextDocumentWillSaveEvent;

			await handleProposedSave(mockEvent, kernel as Parameters<typeof handleProposedSave>[1], undefined as never);
		} catch {
			// handleProposedSave may throw due to missing canvas module / fs state. Ignore.
		} finally {
			(wsrStateModule.WorkspaceRepoState as unknown as Record<string, unknown>)['getActiveRepoId'] = origGetActiveRepoId;
		}

		// RED today: proposeEdit call args lack repo_id.
		// GREEN after Plan 21-02 wires WorkspaceRepoState.getActiveRepoId into the proposeEdit call.
		const argsObj = proposeEditArgs as Record<string, unknown> | undefined;
		assert.strictEqual(
			argsObj?.['repo_id'],
			'testrepofingerprint',
			'on-will-save.*proposeEdit.*repo_id: expected repo_id from WorkspaceRepoState to be threaded into proposeEdit',
		);
	});
});
