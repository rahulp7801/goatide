/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/save-gate/mandate-d-destructive-no-hover.test.ts — Phase 17 Plan 17-01 (Wave-0) RED suite.
//
// POLISH-04 Mandate D pin: destructive saves NEVER use hover dispatch, regardless of
// goatide.saveGate.benign setting. Encoded as a 4×3 (tier, isDestructive) × benignSetting
// matrix snapshot via single deepStrictEqual (per CLAUDE.md Learnings minimize-assertions).
//
// Rows = the 4 reachable (tier, isDestructive) tuples:
//   (silent, false), (inline, false), (modal, false), (modal, true)
// Cols = benignSetting ∈ {modal, hover, suppress}
//
// Wave 1 Plan 17-02 GREEN-flips these tests by adding dispatchHover + resource-scoped reads.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

// Helper to build a minimal but executable mock CanvasModule for a given (tier, isDestructive).
// Uses __setCanvasModuleForTests to inject a fully-controlled mock so we don't rely on the
// real kernel/dist/canvas/index.js ESM namespace (which is immutable — cannot be patched directly).
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

describe('POLISH-04 Mandate D — destructive saves never use hover dispatch', () => {

	it('POLISH-04 Mandate D — destructive saves never use hover dispatch (4x3 (tier, isDestructive) x benignSetting matrix snapshot via deepStrictEqual)', async () => {
		// Build the 4×3 matrix by calling dispatchTier with injected canvasMod + spied vscode APIs.
		//
		// Matrix rows: (tier, isDestructive) tuples
		// Matrix cols: benignSetting ∈ {modal, hover, suppress}
		//
		// For each cell we capture:
		//   panelShowAndAwaitCalls: number of times panel.showAndAwait was called
		//   setStatusBarCalls: number of times vscode.window.setStatusBarMessage was called
		//
		// Mandate D contract:
		//   ALL (modal, true) rows: showAndAwait === 1 (destructiveSetting='confirm'), setStatusBar === 0
		//   (silent, false, hover): setStatusBar === 1, showAndAwait === 0
		//   (silent, false, modal): showAndAwait === 1, setStatusBar === 0
		//   (silent, false, suppress): both === 0
		//   (inline, false, *): both === 0 (inline fires atomically; un-gated by benignSetting)
		//   (modal, false, *): showAndAwait === 1 (highImpactSetting defaults to 'confirm'), setStatusBar === 0

		const { dispatchTier } = await import('../../../src/save-gate/tier-dispatch.js');
		const { __resetCanvasModuleForTests } = await import('../../../src/save-gate/canvas-module.js');

		type CanvasTierLocal = 'silent' | 'inline' | 'modal';
		const rows = [
			{ tier: 'silent' as CanvasTierLocal, isDestructive: false },
			{ tier: 'inline' as CanvasTierLocal, isDestructive: false },
			{ tier: 'modal' as CanvasTierLocal, isDestructive: false },
			{ tier: 'modal' as CanvasTierLocal, isDestructive: true },
		] as const;
		const benignSettings = ['modal', 'hover', 'suppress'] as const;

		// Build expected map per Mandate D contract
		const expectedMap: Record<string, { showAndAwaitCalls: number; setStatusBarCalls: number }> = {};
		for (const { tier, isDestructive } of rows) {
			for (const benignSetting of benignSettings) {
				const key = `${tier}/${isDestructive}/${benignSetting}`;
				if (tier === 'silent' && !isDestructive) {
					if (benignSetting === 'hover') {
						expectedMap[key] = { showAndAwaitCalls: 0, setStatusBarCalls: 1 };
					} else if (benignSetting === 'modal') {
						expectedMap[key] = { showAndAwaitCalls: 1, setStatusBarCalls: 0 };
					} else {
						// suppress
						expectedMap[key] = { showAndAwaitCalls: 0, setStatusBarCalls: 0 };
					}
				} else if (tier === 'inline' && !isDestructive) {
					// inline: un-gated, applyEdit immediately, fire-and-forget toast (not showAndAwait)
					expectedMap[key] = { showAndAwaitCalls: 0, setStatusBarCalls: 0 };
				} else if (tier === 'modal' && !isDestructive) {
					// highImpactSetting defaults to 'confirm' → showAndAwait called once
					expectedMap[key] = { showAndAwaitCalls: 1, setStatusBarCalls: 0 };
				} else {
					// (modal, true): destructiveSetting defaults to 'confirm' → showAndAwait called once
					// Mandate D: benignSetting does NOT affect this branch
					expectedMap[key] = { showAndAwaitCalls: 1, setStatusBarCalls: 0 };
				}
			}
		}

		const resultMap: Record<string, { showAndAwaitCalls: number; setStatusBarCalls: number }> = {};

		const origSetStatusBarMessage = vscode.window.setStatusBarMessage.bind(vscode.window);
		const origGetConfig = vscode.workspace.getConfiguration.bind(vscode.workspace);

		try {
			for (const { tier, isDestructive } of rows) {
				// Inject mock canvas module for this row
				await buildMockCanvasMod(tier, isDestructive);

				for (const benignSetting of benignSettings) {
					const key = `${tier}/${isDestructive}/${benignSetting}`;

					let showAndAwaitCalls = 0;
					let setStatusBarCalls = 0;

					// Spy on setStatusBarMessage
					(vscode.window as unknown as Record<string, unknown>)['setStatusBarMessage'] = () => {
						setStatusBarCalls++;
						return { dispose: () => { } };
					};

					// Fake goatide.saveGate config returning the matrix benignSetting
					const fakeConfig = {
						get: (key2: string, defaultValue?: unknown) => {
							if (key2 === 'benign') { return benignSetting; }
							if (key2 === 'destructive') { return 'confirm'; }
							if (key2 === 'highImpact') { return 'confirm'; }
							return defaultValue;
						},
						has: (_k: string) => false,
						inspect: (_k: string) => undefined,
						update: async () => { },
					} as unknown as vscode.WorkspaceConfiguration;

					const fakeOtherConfig = {
						get: (_k: string, defaultValue?: unknown) => defaultValue,
						has: (_k: string) => false,
						inspect: (_k: string) => undefined,
						update: async () => { },
					} as unknown as vscode.WorkspaceConfiguration;

					(vscode.workspace as unknown as Record<string, unknown>)['getConfiguration'] = (section: unknown) => {
						if (section === 'goatide.saveGate') { return fakeConfig; }
						return fakeOtherConfig;
					};

					// Panel mock that counts showAndAwait calls
					const panel = {
						showAndAwait: async () => {
							showAndAwaitCalls++;
							return { kind: 'accept', accept_latency_ms: 0 };
						},
						registerOverrideHandler: () => { },
						registerRationaleHandler: () => { },
						dispose: async () => { },
						postComplianceReportPartial: async () => { },
						postComplianceReportFull: async () => { },
					} as unknown as Parameters<typeof dispatchTier>[0]['panel'];

					const kernel = {
						queryNodes: async () => ({ nodes: [] }),
						atomicAccept: async () => ({ attempt_node_id: 'test-attempt' }),
						proposeEdit: async () => { throw new Error('should not be called'); },
						recordRejection: async () => { },
						recordContractOverride: async () => ({ attempt_node_id: 'test-override' }),
						onDriftProgress: () => () => { },
						runRippleProgressive: async () => ({ report: { contract_node_id: '', max_hops: 1, definitely_affected: [], potentially_affected: [], truncated: false, generated_at: '' } }),
						isConnected: () => true,
					} as unknown as Parameters<typeof dispatchTier>[0]['kernel'];

					const docUri = vscode.Uri.file('/tmp/mandate-d-test.ts');
					const doc = {
						uri: docUri,
						getText: () => '',
						fileName: '/tmp/mandate-d-test.ts',
						languageId: 'typescript',
						version: 1,
						isDirty: false,
						isUntitled: false,
						isClosed: false,
						save: async () => true,
						lineCount: 1,
						eol: 1,
					} as unknown as Parameters<typeof dispatchTier>[0]['doc'];

					const inputs = {
						kernel,
						panel,
						doc,
						original: '',
						modified: '// change',
						diff: '+// change',
						receipt: {
							id: `receipt-${key}`,
							change_id: `change-${key}`,
							citations: [],
							graph_snapshot_tx_time: null,
							drill_chain: [],
						} as unknown as Parameters<typeof dispatchTier>[0]['receipt'],
						startMs: Date.now(),
						driftFindings: [],
						lockTrigger: null,
					};

					try {
						await dispatchTier(inputs as unknown as Parameters<typeof dispatchTier>[0]);
					} catch {
						// Some paths may throw (e.g. when applyEditAtomically is called).
					}

					resultMap[key] = { showAndAwaitCalls, setStatusBarCalls };
				}
			}
		} finally {
			// Restore originals
			(vscode.window as unknown as Record<string, unknown>)['setStatusBarMessage'] = origSetStatusBarMessage;
			(vscode.workspace as unknown as Record<string, unknown>)['getConfiguration'] = origGetConfig;
			__resetCanvasModuleForTests();
		}

		assert.deepStrictEqual(
			resultMap,
			expectedMap,
			'Mandate D 4×3 (tier, isDestructive) × benignSetting matrix dispatch contract violated',
		);
	});

	it('dispatchHover only invoked when (tier === silent, isDestructive === false, benignSetting === hover)', async () => {
		// Verify that exactly 1 cell in the 4×3 matrix triggers a setStatusBarMessage call
		// (the hover notification), and that cell is precisely (silent, false, hover).
		// All other 11 cells: setStatusBarMessage call count === 0.

		const { dispatchTier } = await import('../../../src/save-gate/tier-dispatch.js');
		const { __resetCanvasModuleForTests } = await import('../../../src/save-gate/canvas-module.js');

		type CanvasTierLocal = 'silent' | 'inline' | 'modal';
		const rows = [
			{ tier: 'silent' as CanvasTierLocal, isDestructive: false },
			{ tier: 'inline' as CanvasTierLocal, isDestructive: false },
			{ tier: 'modal' as CanvasTierLocal, isDestructive: false },
			{ tier: 'modal' as CanvasTierLocal, isDestructive: true },
		] as const;
		const benignSettings = ['modal', 'hover', 'suppress'] as const;

		// Track which cells invoke dispatchHover (via setStatusBarMessage call)
		const hoverCells: string[] = [];

		const origSetStatusBarMessage = vscode.window.setStatusBarMessage.bind(vscode.window);
		const origGetConfig = vscode.workspace.getConfiguration.bind(vscode.workspace);

		try {
			for (const { tier, isDestructive } of rows) {
				await buildMockCanvasMod(tier, isDestructive);

				for (const benignSetting of benignSettings) {
					const key = `${tier}/${isDestructive}/${benignSetting}`;
					let setStatusBarCalled = false;

					(vscode.window as unknown as Record<string, unknown>)['setStatusBarMessage'] = () => {
						setStatusBarCalled = true;
						return { dispose: () => { } };
					};

					const fakeConfig = {
						get: (key2: string, defaultValue?: unknown) => {
							if (key2 === 'benign') { return benignSetting; }
							if (key2 === 'destructive') { return 'confirm'; }
							if (key2 === 'highImpact') { return 'confirm'; }
							return defaultValue;
						},
						has: (_k: string) => false,
						inspect: (_k: string) => undefined,
						update: async () => { },
					} as unknown as vscode.WorkspaceConfiguration;

					const fakeOtherConfig = {
						get: (_k: string, defaultValue?: unknown) => defaultValue,
						has: (_k: string) => false,
						inspect: (_k: string) => undefined,
						update: async () => { },
					} as unknown as vscode.WorkspaceConfiguration;

					(vscode.workspace as unknown as Record<string, unknown>)['getConfiguration'] = (section: unknown) => {
						if (section === 'goatide.saveGate') { return fakeConfig; }
						return fakeOtherConfig;
					};

					const panel = {
						showAndAwait: async () => ({ kind: 'accept', accept_latency_ms: 0 }),
						registerOverrideHandler: () => { },
						registerRationaleHandler: () => { },
						dispose: async () => { },
						postComplianceReportPartial: async () => { },
						postComplianceReportFull: async () => { },
					} as unknown as Parameters<typeof dispatchTier>[0]['panel'];

					const kernel = {
						queryNodes: async () => ({ nodes: [] }),
						atomicAccept: async () => ({ attempt_node_id: 'test-attempt' }),
						proposeEdit: async () => { throw new Error('should not be called'); },
						recordRejection: async () => { },
						recordContractOverride: async () => ({ attempt_node_id: 'test-override' }),
						onDriftProgress: () => () => { },
						runRippleProgressive: async () => ({ report: { contract_node_id: '', max_hops: 1, definitely_affected: [], potentially_affected: [], truncated: false, generated_at: '' } }),
						isConnected: () => true,
					} as unknown as Parameters<typeof dispatchTier>[0]['kernel'];

					const docUri = vscode.Uri.file('/tmp/mandate-d-hover-only-test.ts');
					const doc = {
						uri: docUri,
						getText: () => '',
						fileName: '/tmp/mandate-d-hover-only-test.ts',
						languageId: 'typescript',
						version: 1,
						isDirty: false,
						isUntitled: false,
						isClosed: false,
						save: async () => true,
						lineCount: 1,
						eol: 1,
					} as unknown as Parameters<typeof dispatchTier>[0]['doc'];

					const inputs = {
						kernel,
						panel,
						doc,
						original: '',
						modified: '// change',
						diff: '+// change',
						receipt: {
							id: `receipt-${key}`,
							change_id: `change-${key}`,
							citations: [],
							graph_snapshot_tx_time: null,
							drill_chain: [],
						} as unknown as Parameters<typeof dispatchTier>[0]['receipt'],
						startMs: Date.now(),
						driftFindings: [],
						lockTrigger: null,
					};

					try {
						await dispatchTier(inputs as unknown as Parameters<typeof dispatchTier>[0]);
					} catch {
						// Allowed — some paths may fail at non-spy steps
					}

					if (setStatusBarCalled) {
						hoverCells.push(key);
					}
				}
			}
		} finally {
			(vscode.window as unknown as Record<string, unknown>)['setStatusBarMessage'] = origSetStatusBarMessage;
			(vscode.workspace as unknown as Record<string, unknown>)['getConfiguration'] = origGetConfig;
			__resetCanvasModuleForTests();
		}

		// Mandate D: exactly 1 cell should invoke dispatchHover, and it MUST be (silent, false, hover)
		assert.deepStrictEqual(
			hoverCells,
			['silent/false/hover'],
			'dispatchHover (setStatusBarMessage) must be invoked ONLY for (silent, false, hover) — ' +
			'all other 11 cells must have setStatusBarMessage call count === 0',
		);
	});

	it('caller-count fence — dispatchHover production occurrences in tier-dispatch.ts match the locked count', () => {
		// Pre-pin: the locked caller count for dispatchHover in tier-dispatch.ts production source.
		// Wave 0: count === 0 (function doesn't exist yet) — assert 0 occurrences, which is correct.
		// Wave 1 Plan 17-02 GREEN-flips: changes this to assert count === 2
		// (1 function declaration + 1 caller in the silent-tier benign branch).
		//
		// LOCKED_CALLER_COUNT is a named constant so future edits that bump it from 2 to 3
		// (e.g. adding a JSDoc cross-reference) trigger a deliberate test update rather than
		// silent erosion. Reference Phase 14 Plan 14-03 caller-count fence convention.

		const LOCKED_CALLER_COUNT_WAVE1 = 2; // declaration + 1 caller in silent branch

		const tierDispatchPath = path.resolve(
			__dirname,
			'../../../src/save-gate/tier-dispatch.ts',
		);

		let source = '';
		try {
			source = fs.readFileSync(tierDispatchPath, 'utf8');
		} catch {
			source = '';
		}

		// Count all occurrences of the identifier 'dispatchHover' (word boundary)
		const matches = source.match(/\bdispatchHover\b/g) ?? [];
		const count = matches.length;

		// Wave 0: dispatchHover not yet added → count === 0. This is the RED state.
		// Wave 1: count === LOCKED_CALLER_COUNT_WAVE1 (2). This is the GREEN state.
		if (count === 0) {
			// RED state — assert fail with explicit GREEN-flip hint
			assert.fail(
				`Wave 1 Plan 17-02 GREEN-flips — dispatchHover occurrence count in tier-dispatch.ts is ${count}; ` +
				`expected ${LOCKED_CALLER_COUNT_WAVE1} after Wave 1 lands (1 declaration + 1 caller). ` +
				'Update LOCKED_CALLER_COUNT_WAVE1 if future production edits legitimately add a 3rd occurrence.',
			);
		}

		assert.strictEqual(
			count,
			LOCKED_CALLER_COUNT_WAVE1,
			`dispatchHover occurrence count in tier-dispatch.ts must equal ${LOCKED_CALLER_COUNT_WAVE1} ` +
			'(1 declaration + 1 caller in silent-tier benign=hover branch). ' +
			'If you added a JSDoc cross-reference, update LOCKED_CALLER_COUNT_WAVE1 deliberately.',
		);
	});

});
