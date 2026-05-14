/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/inspector/panel.ts —
// Phase 15 Plan 15-01 (Wave-0 — DEEP-02 GraphInspectorPanel class stub).
//
// Wave-0 ships the class skeleton + a real dispose() body (Phase 12 H1 pattern inherited
// from CanvasPanel.dispose() — clear singleton BEFORE cleanup so concurrent getOrCreate()
// can't reuse a disposed panel). getOrCreate() and reveal() are throw-stubs until Wave 2
// (Plan 15-03) lands the webview wiring.
//
// VIEW_TYPE = 'goatide.graphInspector' — DISTINCT from CanvasPanel.VIEW_TYPE
// ('goatide.canvas'). The two panels coexist; the inspector is read-only and is structurally
// fenced by scripts/ci/refuse-deep05-write.sh (Phase 14 gate — inspector/ source files MUST
// NOT mention the four banned write-RPC token strings, even in comments).
//
// Wave 2 (Plan 15-03) will add:
//   - getOrCreate(context) — singleton creation + webview panel allocation
//   - reveal() — show panel + post the initial inspector.show payload
//   - registerSnapshotHandler(handler) — transport-only handler registration mirror of
//     CanvasPanel.registerRationaleHandler (Plan 14-02 pattern — panel.ts never imports
//     KernelClient; the snapshot fetch lives in the activation site that knows the client).

import * as vscode from 'vscode';

/**
 * Singleton WebviewPanel hosting the bitemporal Graph Inspector (DEEP-02). Read-only —
 * the inspector renders snapshots from `KernelClient.queryGraphSnapshot` (Wave 1) and never
 * issues write RPCs. Refusal to mutate the graph is enforced structurally by
 * `scripts/ci/refuse-deep05-write.sh` (Phase 14 carry — token grep over inspector/).
 *
 * Lifecycle: one panel per workspace, reused across show() calls. dispose() clears the
 * singleton BEFORE panel.dispose() fires onDidDispose so a concurrent getOrCreate() cannot
 * return a stale disposed instance (Phase 12 Plan 13-02 H1 pattern — verified at
 * src/canvas/panel.ts:258-273).
 *
 * Wave-0 status (Plan 15-01):
 *   - VIEW_TYPE literal:  GREEN (used by the inequality test against CanvasPanel)
 *   - dispose() body:     GREEN (Phase 12 H1 fence is critical infrastructure; no reason to defer)
 *   - getOrCreate():      throw-stub (Wave 2 — Plan 15-03)
 *   - reveal():           throw-stub (Wave 2 — Plan 15-03)
 */
export class GraphInspectorPanel {
	public static readonly VIEW_TYPE = 'goatide.graphInspector';
	private static instance: GraphInspectorPanel | undefined;

	private constructor(
		private readonly panel: vscode.WebviewPanel,
		private readonly extensionUri: vscode.Uri,
	) {
		// Wave-0 stub - Plan 15-03 implements (singleton wiring + html + message subscription).
		void this.extensionUri;
	}

	public static getOrCreate(_context: vscode.ExtensionContext): GraphInspectorPanel {
		throw new Error('Wave 2 implements GraphInspectorPanel.getOrCreate - Plan 15-03');
	}

	public reveal(): void {
		throw new Error('Wave 2 implements reveal() - Plan 15-03');
	}

	public dispose(): void {
		// Phase 12 H1 pattern (verified canvas/panel.ts:258-273): clear singleton at TOP
		// before cleanup() + panel.dispose() so subsequent getOrCreate() during async
		// disposal cascade sees a fresh null instance and creates a new panel.
		GraphInspectorPanel.instance = undefined;
		this.panel.dispose();
	}
}
