/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/inspector/panel.ts —
// Phase 15 Plan 15-03 (Wave-2 — DEEP-02 host wiring real implementation).
//
// VIEW_TYPE = 'goatide.graphInspector' — DISTINCT from CanvasPanel.VIEW_TYPE
// ('goatide.canvas'). The two panels coexist; the inspector is read-only and is structurally
// fenced by scripts/ci/refuse-deep05-write.sh (Phase 14 gate — inspector/ source files MUST
// NOT mention the four banned write-RPC token strings, even in comments).
//
// Wave-2 (this plan):
//   - getOrCreate(context, readonlyKernelClient) — real singleton creation + webview panel
//     allocation, mirroring CanvasPanel.getOrCreate (canvas/panel.ts:133)
//   - reveal() — show panel; uses ViewColumn.Active (Phase 12 H2 inheritance — NOT Beside)
//   - handleMessage — routes inspector.ready + inspector.requestSnapshot via the readonly
//     kernel client; posts inspector.show / inspector.error back via HostRpc
//   - Wave-2 renderHtml ships an inline minimal shell; Task 2 Step 6 upgrades it to lazy-
//     load the bundled HTML once Wave 3 lands dist/inspector/index.html.
//
// Mandate B fence (Pitfall 7 carry): this file imports ReadonlyKernelClient ONLY — never
// the bare KernelClient. refuse-deep05-write.sh structurally enforces (token grep over
// inspector/). Phase 14 carry — the same fence applies to session-priority-lens.ts.
//
// Pitfall 1 carry (REC-03 single-snapshot invariant): only the inspector.ready branch may
// derive an asOf via new Date().toISOString(), and only when transitions[] is empty (no
// graph rows yet — empty graph fallback). The inspector.requestSnapshot branch threads the
// webview's asOf verbatim; no Date() math.

import * as vscode from 'vscode';
import * as crypto from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import type { ReadonlyKernelClient } from './ReadonlyKernelClient.js';
import { InspectorWebviewToHostSchema, type InspectorHostToWebview } from './messages.js';
import type { WorkspaceRepo } from './workspace-repos.js';

/**
 * Singleton WebviewPanel hosting the bitemporal Graph Inspector (DEEP-02). Read-only —
 * the inspector renders snapshots from `ReadonlyKernelClient.queryGraphSnapshot` (Wave 1)
 * and never issues write RPCs. Refusal to mutate the graph is enforced structurally by
 * `scripts/ci/refuse-deep05-write.sh` (Phase 14 carry — token grep over inspector/).
 *
 * Lifecycle: one panel per workspace, reused across getOrCreate() calls. dispose() clears
 * the singleton BEFORE panel.dispose() fires onDidDispose so a concurrent getOrCreate()
 * cannot return a stale disposed instance (Phase 12 Plan 13-02 H1 pattern — verified at
 * src/canvas/panel.ts:258-273).
 *
 * Wave-2 status (Plan 15-03):
 *   - VIEW_TYPE literal:  GREEN
 *   - dispose() body:     GREEN (Phase 12 H1 fence — singleton clear at top)
 *   - getOrCreate():      GREEN — real createWebviewPanel + singleton wiring
 *   - reveal():           GREEN — ViewColumn.Active (Phase 12 H2)
 *   - handleMessage():    GREEN — inspector.ready + inspector.requestSnapshot routing
 *   - renderHtml():       Wave-2 inline shell; Task 2 Step 6 upgrades to lazy-load
 *                         dist/inspector/index.html (created Wave 3)
 */
export class GraphInspectorPanel {
	public static readonly VIEW_TYPE = 'goatide.graphInspector';
	private static instance: GraphInspectorPanel | undefined;

	private readonly disposables: vscode.Disposable[] = [];
	/** Phase 17 Plan 17-04 DEEP-06 phase-B — cross-repo mode state for next show(). */
	private pendingCrossRepoRepos: ReadonlyArray<WorkspaceRepo> | null = null;

	private constructor(
		private readonly panel: vscode.WebviewPanel,
		private readonly extensionUri: vscode.Uri,
		private readonly readonlyKernelClient: ReadonlyKernelClient,
	) {
		this.disposables.push(this.panel.onDidDispose(() => this.dispose()));
		this.disposables.push(this.panel.webview.onDidReceiveMessage((msg) => { void this.handleMessage(msg); }));
		this.panel.webview.html = this.renderHtml();
	}

	/**
	 * Get the existing singleton or create a fresh inspector panel. Mirrors
	 * CanvasPanel.getOrCreate (canvas/panel.ts:133) — singleton check first, then
	 * createWebviewPanel with ViewColumn.Active (Phase 12 H2 — NOT Beside),
	 * retainContextWhenHidden:false (Wave 3 uses vscode.setState persistence instead),
	 * localResourceRoots scoped to dist/inspector/, enableCommandUris:false (security).
	 *
	 * @param readonlyKernelClient The structurally-narrowed read-only KernelClient surface.
	 *   The caller (extension.ts) passes the full KernelClient instance; TypeScript narrows
	 *   it to the Pick<>'d ReadonlyKernelClient at the assignment site. No cast is needed.
	 */
	public static getOrCreate(
		context: vscode.ExtensionContext,
		readonlyKernelClient: ReadonlyKernelClient,
	): GraphInspectorPanel {
		if (GraphInspectorPanel.instance) {
			GraphInspectorPanel.instance.reveal();
			return GraphInspectorPanel.instance;
		}
		const panel = vscode.window.createWebviewPanel(
			GraphInspectorPanel.VIEW_TYPE,
			'GoatIDE: Graph Inspector',
			vscode.ViewColumn.Active,
			{
				enableScripts: true,
				retainContextWhenHidden: false,
				localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'dist', 'inspector')],
				enableCommandUris: false,
			},
		);
		GraphInspectorPanel.instance = new GraphInspectorPanel(panel, context.extensionUri, readonlyKernelClient);
		return GraphInspectorPanel.instance;
	}

	/**
	 * Phase 17 Plan 17-04 DEEP-06 phase-B — cross-repo factory. Returns the SAME singleton
	 * as {@link getOrCreate} (single VIEW_TYPE 'goatide.graphInspector') but threads cross-repo
	 * metadata into the initial inspector.show payload so the webview can apply cross-repo
	 * edge styling (dashed + accent color) and node-tooltip repo_id display.
	 *
	 * Pitfall 2 avoidance: do NOT create a sibling panel with a new VIEW_TYPE. The cross-repo
	 * distinction is a boolean flag on the show payload, NOT a separate panel class or VIEW_TYPE.
	 *
	 * Mandate B fence: this method imports ZERO write-RPC symbols. See
	 * scripts/ci/refuse-deep05-write.sh BANNED array for the canonical token list.
	 *
	 * @param context        VS Code extension context for panel lifecycle management.
	 * @param readonlyKernelClient The structurally-narrowed read-only KernelClient surface.
	 * @param repos          Workspace repos enumerated by enumerateWorkspaceRepos() — requires
	 *                       repos.length >= 2 for meaningful cross-repo mode (callers enforce).
	 */
	public static getOrCreateForCrossRepo(
		context: vscode.ExtensionContext,
		readonlyKernelClient: ReadonlyKernelClient,
		repos: ReadonlyArray<WorkspaceRepo>,
	): GraphInspectorPanel {
		const panel = GraphInspectorPanel.getOrCreate(context, readonlyKernelClient);
		// Stash the cross-repo metadata so the next handleMessage('inspector.ready') dispatch
		// picks it up and threads cross_repo_mode:true + workspace_repos into the show payload.
		panel.pendingCrossRepoRepos = repos;
		return panel;
	}

	public reveal(): void {
		this.panel.reveal(vscode.ViewColumn.Active, false);
	}

	public dispose(): void {
		// Phase 12 H1 pattern (verified canvas/panel.ts:258-273): clear singleton at TOP
		// before disposing the panel + listeners so subsequent getOrCreate() during async
		// disposal cascade sees a fresh null instance and creates a new panel.
		GraphInspectorPanel.instance = undefined;
		for (const d of this.disposables) {
			try { d.dispose(); } catch { /* best-effort */ }
		}
		this.disposables.length = 0;
		this.panel.dispose();
	}

	/**
	 * Host-side message router for the inspector webview. Two inbound shapes (both
	 * read-only):
	 *   - 'inspector.ready' — initial snapshot dispatch. Host calls queryTimelineTransitions
	 *     FIRST (to obtain the discrete-snap slider step set), picks the LAST transition as
	 *     the initial asOf (so the slider thumb position matches the displayed snapshot —
	 *     Issue #2 fix). Falls back to new Date().toISOString() ONLY when transitions[] is
	 *     empty (no graph rows yet).
	 *   - 'inspector.requestSnapshot' — slider drag. Host reads the asOf verbatim from the
	 *     webview message; Pitfall 1 carry — NO Date() math here.
	 *
	 * Both branches catch RPC failures and post inspector.error back to the webview.
	 */
	private async handleMessage(msg: unknown): Promise<void> {
		const parsed = InspectorWebviewToHostSchema.safeParse(msg);
		if (!parsed.success) {
			console.warn('[goatide-bridge] GraphInspectorPanel: unrecognized webview message', parsed.error.flatten());
			return;
		}
		switch (parsed.data.type) {
			case 'inspector.ready': {
				// Issue #2 (gsd-plan-checker) — initial asOf = LAST known transition so the
				// slider thumb position (transitions.indexOf(pending)) returns a valid index
				// >= 0 instead of -1. Empty-graph fallback to new Date().toISOString() ONLY
				// when transitions[] is empty (no nodes yet — empty graph).
				try {
					const transitionsResult = await this.readonlyKernelClient.queryTimelineTransitions();
					const asOf = transitionsResult.transitions.length > 0
						? transitionsResult.transitions[transitionsResult.transitions.length - 1]
						: new Date().toISOString();
					const snapshot = await this.readonlyKernelClient.queryGraphSnapshot({ asOf });
					// Phase 17 Plan 17-04 DEEP-06 phase-B — thread cross-repo metadata when the
					// panel was created via getOrCreateForCrossRepo. Consume + clear so that a
					// subsequent inspector.ready (e.g. after hide+reshow) defaults to single-repo mode.
					const crossRepoRepos = this.pendingCrossRepoRepos;
					this.pendingCrossRepoRepos = null;
					const out: InspectorHostToWebview = {
						type: 'inspector.show',
						asOf,
						nodes: snapshot.nodes,
						edges: snapshot.edges,
						truncated: snapshot.truncated,
						transitions: transitionsResult.transitions,
						...(crossRepoRepos !== null ? {
							cross_repo_mode: true,
							workspace_repos: crossRepoRepos.map(r => ({
								folder_uri: r.folder.uri.toString(),
								folder_name: r.folder.name,
								repo_id: r.repoId,
								remote_url: r.remoteUrl,
							})),
						} : {}),
					};
					await this.panel.webview.postMessage(out);
				} catch (err) {
					const reason = err instanceof Error ? err.message : String(err);
					const out: InspectorHostToWebview = { type: 'inspector.error', reason };
					await this.panel.webview.postMessage(out);
				}
				return;
			}
			case 'inspector.requestSnapshot': {
				// Slider-driven request — asOf from webview verbatim. Pitfall 1 carry: NO
				// new Date() / Date.now() math here. The webview obtained asOf from the
				// transitions[] array delivered on the initial inspector.show.
				try {
					const snapshot = await this.readonlyKernelClient.queryGraphSnapshot({ asOf: parsed.data.asOf });
					const out: InspectorHostToWebview = {
						type: 'inspector.show',
						asOf: parsed.data.asOf,
						nodes: snapshot.nodes,
						edges: snapshot.edges,
						truncated: snapshot.truncated,
						// transitions[] is fetched only on inspector.ready, not on slider drag.
					};
					await this.panel.webview.postMessage(out);
				} catch (err) {
					const reason = err instanceof Error ? err.message : String(err);
					const out: InspectorHostToWebview = { type: 'inspector.error', reason };
					await this.panel.webview.postMessage(out);
				}
				return;
			}
		}
	}

	/**
	 * Renders the webview HTML. Two paths:
	 *   - Primary (Wave 3+): read the bundled `dist/inspector/index.html` from disk via
	 *     readFileSync, substitute CSP nonce / cspSource / bundle URI placeholders. Mirrors
	 *     canvas/panel.ts:419-448 (the canonical getHtmlForWebview pattern).
	 *   - Fallback (Wave 2 close state): inline minimal shell. The webview loads the bundled
	 *     index.js (which doesn't exist yet) and the React root stays empty. Wave 3 ships
	 *     src/inspector/webview/index.{tsx,html} and esbuild copies index.html to dist/, at
	 *     which point existsSync auto-flips to the primary path.
	 *
	 * Issue #8 (gsd-plan-checker): panel.ts edits are entirely within Plan 15-03. Plan
	 * 15-04 (Wave 3) does NOT re-edit panel.ts; the lazy-load guard handles the transition.
	 */
	private renderHtml(): string {
		const nonce = crypto.randomBytes(16).toString('base64').replace(/\W/g, '').slice(0, 32);
		const cspSource = this.panel.webview.cspSource;
		const bundledJsUri = this.panel.webview
			.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'inspector', 'index.js'))
			.toString();
		const bundledHtmlPath = vscode.Uri.joinPath(this.extensionUri, 'dist', 'inspector', 'index.html');
		if (existsSync(bundledHtmlPath.fsPath)) {
			// Primary path — Wave 3 (Plan 15-04) ships dist/inspector/index.html via esbuild's
			// post-build copy step.
			return readFileSync(bundledHtmlPath.fsPath, 'utf-8')
				.replaceAll('${nonce}', nonce)
				.replaceAll('${webview.cspSource}/index.js', bundledJsUri)
				.replaceAll('${webview.cspSource}', cspSource);
		}
		// Wave-2 fallback — bundled HTML doesn't exist yet (Wave 3 lands the .tsx + .html).
		// Returns a minimal shell; the user sees an empty webview until Wave 3 ships.
		return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src ${cspSource} 'nonce-${nonce}'; style-src ${cspSource} 'unsafe-inline';"></head><body><div id="root"></div><script nonce="${nonce}" src="${bundledJsUri}"></script></body></html>`;
	}
}
