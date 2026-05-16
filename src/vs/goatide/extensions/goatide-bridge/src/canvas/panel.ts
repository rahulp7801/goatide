/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/canvas/panel.ts - Phase 4 (Plan 04-03) shared CanvasPanel manager.
//
// Per RESEARCH ## Pattern 1: single shared panel per workspace; retainContextWhenHidden=true.
// Per RESEARCH ## Pattern 2: HostRpc owns the trust boundary; we subscribe to typed messages.
// Per RESEARCH ## Anti-Patterns: enableCommandUris=false.

import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as crypto from 'node:crypto';
import { HostRpc } from './rpc.js';
import type { CanvasShowPayload, WebviewToHost, RationaleChainEntryForCanvas } from './messages.js';
import type { AnchorRequest as KernelAnchorRequest } from '../kernel/methods.js';

export interface CanvasDecision {
	kind: 'accept' | 'reject' | 'reject_with_note';
	change_id: string;
	accept_latency_ms?: number;
	note?: string;
}

/**
 * Phase 7 Plan 07-07 — Override handler callback signature. tier-dispatch.ts registers a
 * callback via panel.registerOverrideHandler on construction; panel.ts forwards
 * 'record_override' webview messages into this callback. The callback validates note >=1
 * char, invokes kernel.recordContractOverride, applies the file write atomically, and
 * returns the result back to panel.ts which posts it as record_override.response.
 *
 * Option A (B6 resolution): tier-dispatch.ts is the SOLE caller of
 * kernel.recordContractOverride. panel.ts is a transport-layer pass-through; it does NOT
 * call the kernel directly. refuse-silent-override.sh allowlists kernel/src/drift/ +
 * bridge/src/save-gate/ to enforce this boundary.
 */
export interface OverrideHandlerPayload {
	change_id: string;
	contract_node_id: string;
	section_name: string;
	note: string;
}

export interface OverrideHandlerResult {
	ok: boolean;
	attempt_node_id?: string;
	error?: string;
}

export type OverrideHandler = (payload: OverrideHandlerPayload) => Promise<OverrideHandlerResult>;

/**
 * Phase 14 Plan 14-02 (DEEP-01) — rationale-chain fetch callback. Registered by the
 * extension activation (or tier-dispatch) on construction; panel.ts handleMessage forwards
 * the canvas.requestRationale webview message into this callback. The callback is the
 * Option A integration shape — panel.ts stays transport-only; the actual kernel call
 * lives wherever the KernelClient is owned.
 *
 * Contract:
 *   - The caller MUST pass the receipt's graph_snapshot_tx_time as `asOf` (NOT
 *     Date.now() at click time — Pitfall 1 / REC-03 invariant).
 *   - On kernel-degraded (kernelClient.isConnected() === false) the callback returns
 *     `{ kind: 'degraded' }`. panel.ts re-posts canvas.show with rationale_error =
 *     'kernel-degraded' and the webview RationaleChain component renders the degraded
 *     branch.
 *   - On success the callback returns `{ kind: 'ok', chain }` and panel.ts re-posts
 *     canvas.show with rationale_chain populated.
 *   - On RPC failure (timeout / dispose) the callback may throw OR return
 *     `{ kind: 'degraded' }`; panel.ts catches both shapes.
 */
export interface RationaleHandlerPayload {
	anchor: KernelAnchorRequest;
	asOf: string;
	max_hops?: number;
}

export type RationaleHandlerResult =
	| { kind: 'ok'; chain: ReadonlyArray<RationaleChainEntryForCanvas> }
	| { kind: 'degraded' };

export type RationaleHandler = (payload: RationaleHandlerPayload) => Promise<RationaleHandlerResult>;

/**
 * Phase 16 Plan 16-03 (DEEP-03) — hypothetical-impact fetch callback. Registered by
 * extension activation on construction; panel.ts forwards the webview's
 * canvas.requestConstraintLift message into this callback (transport-only pattern,
 * mirrors registerRationaleHandler). The callback is responsible for the
 * kernelClient.constraintLift invocation + kernel-degraded detection.
 *
 * Contract:
 *   - `asOf` MUST be the receipt's graph_snapshot_tx_time captured at canvas-show time
 *     (Pitfall 1 / REC-03 invariant — NEVER new Date().toISOString() at click time).
 *   - On kernel-degraded the callback returns `{ kind: 'degraded' }`. panel.ts re-posts
 *     canvas.show with `hypothetical_impact_error = 'kernel-degraded'`.
 *   - On success returns `{ kind: 'ok', hypothetical_impact, confidence_score }`.
 */
export interface ConstraintLiftHandlerPayload {
	constraint_node_id: string;
	asOf: string;
	max_hops?: 1 | 2 | 3;
	confidence_threshold?: number;
}

export type ConstraintLiftHandlerResult =
	| { kind: 'ok'; hypothetical_impact: import('./messages.js').ComplianceReportForCanvas; confidence_score: number }
	| { kind: 'degraded' };

export type ConstraintLiftHandler = (payload: ConstraintLiftHandlerPayload) => Promise<ConstraintLiftHandlerResult>;

const VIEW_TYPE = 'goatide.canvas';

/**
 * Shared CanvasPanel - one webview panel per workspace, reused across saves.
 */
export class CanvasPanel {
	private static instance: CanvasPanel | undefined;

	private rpc: HostRpc;
	private pendingResolve?: (decision: CanvasDecision) => void;
	private pendingReject?: (e: Error) => void;
	private explainHandler?: (node_id: string) => void;
	// Phase 7 Plan 07-07 — Override handler callback registered by tier-dispatch.ts.
	// When a 'record_override' webview message arrives, panel.ts invokes this callback
	// (Option A: save-gate-owned override path). panel.ts does NOT call kernel directly.
	private overrideHandler?: OverrideHandler;
	// Phase 14 Plan 14-02 (DEEP-01) — Rationale-chain handler callback. Registered by the
	// extension activation; invoked from handleMessage('canvas.requestRationale').
	private rationaleHandler?: RationaleHandler;
	// Phase 16 Plan 16-03 (DEEP-03) — Constraint-lift handler callback. Registered by the
	// extension activation; invoked from handleMessage('canvas.requestConstraintLift').
	private constraintLiftHandler?: ConstraintLiftHandler;
	// Phase 14 Plan 14-02 (DEEP-01) — The most recent payload posted to the webview via
	// showAndAwait. Captured so handleMessage('canvas.requestRationale') can extract the
	// citation seed + graph_snapshot_tx_time at message-receive time. Cleared on dispose().
	private lastPayload: CanvasShowPayload | null = null;
	private readonly subDisposable: vscode.Disposable;
	private readonly disposeDisposable: vscode.Disposable;
	// canvas.ready handshake (13-02 CLOSE-02): the webview posts this message when React
	// mounts and the message listener is set up. showAndAwait waits for this promise
	// (with a 10s timeout fallback) before posting canvas.show, preventing message loss
	// when the webview is freshly created (Panel B in multi-wave ceremonies).
	private readonly webviewReady: Promise<void>;
	private resolveWebviewReady!: () => void;

	private constructor(
		private readonly panel: vscode.WebviewPanel,
		private readonly extensionUri: vscode.Uri,
	) {
		this.webviewReady = new Promise<void>((resolve) => {
			this.resolveWebviewReady = resolve;
		});
		this.rpc = new HostRpc(panel);
		this.subDisposable = this.rpc.subscribe((msg) => this.handleMessage(msg));
		this.disposeDisposable = this.panel.onDidDispose(() => {
			CanvasPanel.instance = undefined;
			this.cleanup();
		});
		this.panel.webview.html = this.buildHtml();
	}

	static getOrCreate(context: vscode.ExtensionContext): CanvasPanel {
		if (CanvasPanel.instance && !CanvasPanel.isDisposed(CanvasPanel.instance.panel)) {
			return CanvasPanel.instance;
		}
		// Plan 12-03 H2: ViewColumn.Active (not Beside). `Beside` creates a new editor group
		// adjacent to the active one; over a multi-wave ceremony this accumulates editor groups
		// and breaks active-editor detection in Wave-3. `Active` keeps the canvas in the same
		// group as the just-modified file, avoiding focus accumulation. See 12-RESEARCH.md
		// "Per-Issue Current-State Verification 12-03" for the empirical fix rationale.
		const panel = vscode.window.createWebviewPanel(
			VIEW_TYPE,
			'GoatIDE Verification Canvas',
			vscode.ViewColumn.Active,
			{
				enableScripts: true,
				enableCommandUris: false,
				retainContextWhenHidden: true,
				localResourceRoots: [
					vscode.Uri.joinPath(context.extensionUri, 'dist', 'canvas'),
					vscode.Uri.joinPath(context.extensionUri, 'node_modules', '@vscode', 'codicons', 'dist'),
				],
			},
		);
		CanvasPanel.instance = new CanvasPanel(panel, context.extensionUri);
		return CanvasPanel.instance;
	}

	private static isDisposed(panel: vscode.WebviewPanel): boolean {
		try {
			// Probing: accessing webview when disposed throws on some VS Code builds.
			void panel.webview;
			return false;
		} catch {
			return true;
		}
	}

	/** Set the citation.explain handler (Plan 04-04 wires kernel.explainCitation). */
	onCitationExplain(handler: (node_id: string) => void): void {
		this.explainHandler = handler;
	}

	/**
	 * Phase 7 Plan 07-07 — Register the override handler callback. tier-dispatch.ts calls
	 * this on construction; panel.ts forwards 'record_override' webview messages into the
	 * callback (Option A: save-gate-owned override path). The callback's result is posted
	 * back to the webview as 'record_override.response'.
	 *
	 * panel.ts does NOT call kernel.recordContractOverride directly; the audit-trail RPC
	 * lives in tier-dispatch.ts so refuse-silent-override.sh's allowlist
	 * (kernel/src/drift/ + bridge/src/save-gate/) covers the override path.
	 */
	registerOverrideHandler(handler: OverrideHandler): void {
		this.overrideHandler = handler;
	}

	/**
	 * Phase 14 Plan 14-02 (DEEP-01) — Register the rationale-chain fetch callback. The
	 * extension activation wires this on construction; panel.ts forwards the webview's
	 * canvas.requestRationale message into the callback (transport-only pattern, mirrors
	 * registerOverrideHandler). The callback is responsible for the kernel.queryRationaleAt
	 * invocation + kernel-degraded detection; panel.ts re-posts canvas.show with the
	 * resulting chain or the kernel-degraded sentinel.
	 */
	registerRationaleHandler(handler: RationaleHandler): void {
		this.rationaleHandler = handler;
	}

	/**
	 * Phase 16 Plan 16-03 (DEEP-03) — Register the constraint-lift callback. The
	 * extension activation wires this on construction; panel.ts forwards the webview's
	 * canvas.requestConstraintLift message into the callback (transport-only pattern,
	 * mirrors registerRationaleHandler). The callback calls kernelClient.constraintLift
	 * and returns ok/degraded; panel.ts re-posts canvas.show with hypothetical_impact.
	 *
	 * Pitfall 1 fence: asOf passed to the callback is ALWAYS lastPayload.graph_snapshot_tx_time
	 * (captured at canvas-show time), NEVER a freshly-derived Date at click time.
	 */
	registerConstraintLiftHandler(handler: ConstraintLiftHandler): void {
		this.constraintLiftHandler = handler;
	}

	/**
	 * Phase 7 Plan 07-07 — Post the compliance_report.partial or compliance_report.full
	 * message to the webview. tier-dispatch.ts uses these to feed the progressive-disclosure
	 * stream from kernel.runRippleProgressive (notification + final RPC response).
	 */
	postComplianceReportPartial(report: import('./messages.js').ComplianceReportForCanvas): Thenable<boolean> {
		return this.rpc.postRaw({ type: 'compliance_report.partial', payload: { report } });
	}

	postComplianceReportFull(report: import('./messages.js').ComplianceReportForCanvas): Thenable<boolean> {
		return this.rpc.postRaw({ type: 'compliance_report.full', payload: { report } });
	}

	/** Show the canvas + wait for a decision from the developer. */
	async showAndAwait(payload: CanvasShowPayload, options?: { timeoutMs?: number }): Promise<CanvasDecision> {
		// Phase 14 Plan 14-02 (DEEP-01): capture the payload so handleMessage's
		// canvas.requestRationale branch can extract the citation seed + the receipt's
		// graph_snapshot_tx_time at message-receive time. Pitfall 1 fence: the asOf is
		// captured AT receipt-build time (REC-03 single-snapshot invariant) and lives on
		// the payload until the canvas is hidden — never re-derived at click time.
		this.lastPayload = payload;
		const timeoutMs = options?.timeoutMs ?? 10 * 60 * 1000;  // 10 min default
		// Plan 12-03 H2: reveal in ViewColumn.Active (paired with createWebviewPanel above).
		this.panel.reveal(vscode.ViewColumn.Active, false);
		// 13-02 CLOSE-02 canvas.ready handshake: wait for the webview to signal it is ready
		// before sending canvas.show. Without this guard, rpc.show(payload) fires before the
		// webview's window.addEventListener('message', ...) is established (Panel B scenario:
		// freshly-created panel where React hasn't mounted yet). Race: 10s timeout — if the
		// webview never sends canvas.ready (e.g. script load failure), proceed anyway so
		// tier-dispatch can surface the failure via the 25s canvas-accept wait in the harness.
		const READY_TIMEOUT_MS = 10_000;
		await Promise.race([
			this.webviewReady,
			new Promise<void>((resolve) => setTimeout(resolve, READY_TIMEOUT_MS)),
		]);
		await this.rpc.show(payload);
		return new Promise<CanvasDecision>((resolve, reject) => {
			const t = setTimeout(() => {
				this.pendingResolve = undefined;
				this.pendingReject = undefined;
				reject(new Error('CanvasPanel.showAndAwait: timeout'));
			}, timeoutMs);
			this.pendingResolve = (d) => { clearTimeout(t); resolve(d); };
			this.pendingReject = (e) => { clearTimeout(t); reject(e); };
		});
	}

	/** Hide the canvas (after accept/reject). */
	hide(): Thenable<boolean> {
		return this.rpc.hide();
	}

	/** Notify the webview the kernel is degraded. */
	notifyDegraded(reason: string): Thenable<boolean> {
		return this.rpc.notifyDegraded(reason);
	}

	dispose(): void {
		// Clear the singleton BEFORE calling cleanup() + panel.dispose() so that any
		// subsequent getOrCreate() call during the cleanup cascade sees a fresh null
		// instance and creates a new panel rather than reusing this disposed one.
		//
		// Root-cause insight (13-02): cleanup() disposes `disposeDisposable` (the
		// onDidDispose listener) BEFORE panel.dispose() fires onDidDispose. So the
		// `CanvasPanel.instance = undefined` assignment inside the onDidDispose handler
		// never runs — the singleton stays stale. getOrCreate()'s isDisposed() probe
		// (accessing panel.webview) does NOT throw on this Electron build when the panel
		// is disposed, so it incorrectly returns the stale instance. Explicitly clearing
		// here is the authoritative singleton teardown path.
		CanvasPanel.instance = undefined;
		this.cleanup();
		this.panel.dispose();
	}

	private cleanup(): void {
		try { this.subDisposable.dispose(); } catch { /* best-effort */ }
		try { this.disposeDisposable.dispose(); } catch { /* best-effort */ }
		this.rpc.dispose();
		// Phase 14 Plan 14-02: drop the cached payload so any late canvas.requestRationale
		// message arriving after cleanup() returns finds null and short-circuits silently.
		this.lastPayload = null;
		if (this.pendingReject) {
			this.pendingReject(new Error('CanvasPanel disposed before decision'));
			this.pendingResolve = undefined;
			this.pendingReject = undefined;
		}
	}

	private handleMessage(msg: WebviewToHost): void {
		if (msg.type === 'canvas.ready') {
			// Webview signals it has mounted and is ready to receive canvas.show.
			// Resolves the handshake promise used by showAndAwait (no-op if already resolved).
			this.resolveWebviewReady();
			return;
		}
		if (msg.type === 'citation.explain') {
			this.explainHandler?.(msg.payload.citation_node_id);
			return;
		}
		if (msg.type === 'reveal_line') {
			// Phase 7 Plan 07-07 — DriftFindings click-to-jump-to-line. Open the file at the
			// requested line. Best-effort: failures are logged but do not propagate.
			void (async () => {
				try {
					const uri = vscode.Uri.file(msg.payload.file);
					const doc = await vscode.workspace.openTextDocument(uri);
					const editor = await vscode.window.showTextDocument(doc, { preview: true, viewColumn: vscode.ViewColumn.One });
					const line = Math.max(0, msg.payload.line - 1);
					const range = new vscode.Range(line, 0, line, 0);
					editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
					editor.selection = new vscode.Selection(range.start, range.end);
				} catch (e) {
					console.error('[goatide-bridge] reveal_line failed', e);
				}
			})();
			return;
		}
		if (msg.type === 'canvas.requestRationale') {
			// Phase 14 Plan 14-02 (DEEP-01) — "Why does this exist?" button click.
			//
			// W3 fix: citations have NO `anchor` field (kernel/src/receipt/citation.ts:16-22).
			// We extract the citation's node_id and build an AnchorRequest of kind 'node_id'.
			// If there are no citations to anchor against, OR no graph_snapshot_tx_time on the
			// payload, OR no handler registered, OR the handler reports degraded — fall back
			// to the rationale_error sentinel so the webview renders the degraded branch.
			//
			// Pitfall 1 fence (REC-03): asOf is the payload's graph_snapshot_tx_time, NEVER
			// Date.now() at click time. The handler signature enforces this — `asOf` is a
			// required string parameter.
			void (async () => {
				const lp = this.lastPayload;
				if (!lp) {
					return;  // No payload context (canvas already cleared) — drop silently.
				}
				const seedNodeId = lp.citations[0]?.node_id;
				const asOf = lp.graph_snapshot_tx_time ?? null;
				if (!seedNodeId || !asOf || !this.rationaleHandler) {
					// Insufficient context to satisfy the request — render the degraded branch.
					await this.rpc.show({ ...lp, rationale_error: 'kernel-degraded' });
					return;
				}
				try {
					const result = await this.rationaleHandler({
						anchor: { kind: 'node_id', id: seedNodeId },
						asOf,
						max_hops: 4,
					});
					if (result.kind === 'degraded') {
						await this.rpc.show({ ...lp, rationale_error: 'kernel-degraded' });
						return;
					}
					// Cast the readonly chain back through the webview's mutable schema shape.
					const chain = result.chain.map((e) => ({ ...e }));
					const updated: CanvasShowPayload = { ...lp, rationale_chain: chain, rationale_error: null };
					this.lastPayload = updated;
					await this.rpc.show(updated);
				} catch {
					await this.rpc.show({ ...lp, rationale_error: 'kernel-degraded' });
				}
			})();
			return;
		}
		if (msg.type === 'canvas.requestConstraintLift') {
			// Phase 16 Plan 16-03 (DEEP-03) — "Hypothetical Impact" button click.
			//
			// Pitfall 1 fence (REC-03): asOf is `lastPayload.graph_snapshot_tx_time`, captured
			// at canvas-show time. NEVER new Date().toISOString() at click time. Empty-graph
			// defensive fallback to new Date() ONLY when lastPayload is null on first-open
			// (degraded path — no payload context yet).
			void (async () => {
				const lp = this.lastPayload;
				if (!lp) {
					return;  // No payload context (canvas already cleared) — drop silently.
				}
				if (!this.constraintLiftHandler) {
					await this.rpc.show({ ...lp, hypothetical_impact_error: 'kernel-degraded' });
					return;
				}
				// Pitfall 1 fence: asOf from lastPayload (captured at canvas-show time),
				// NOT fresh new Date() at click time. Defensive fallback only when lastPayload is null.
				const asOf = lp.graph_snapshot_tx_time ?? new Date().toISOString();
				try {
					const result = await this.constraintLiftHandler({
						constraint_node_id: msg.payload.constraint_node_id,
						asOf,
						max_hops: msg.payload.max_hops,
						confidence_threshold: msg.payload.confidence_threshold,
					});
					if (result.kind === 'ok') {
						const updated: import('./messages.js').CanvasShowPayload = {
							...lp,
							hypothetical_impact: result.hypothetical_impact,
							hypothetical_impact_error: null,
						};
						this.lastPayload = updated;
						await this.rpc.show(updated);
					} else {
						await this.rpc.show({ ...lp, hypothetical_impact: null, hypothetical_impact_error: 'kernel-degraded' });
					}
				} catch {
					await this.rpc.show({ ...lp, hypothetical_impact: null, hypothetical_impact_error: 'kernel-degraded' });
				}
			})();
			return;
		}
		if (msg.type === 'record_override') {
			// Phase 7 Plan 07-07 — Forward to tier-dispatch.ts via the registered callback
			// (Option A: save-gate-owned override path). panel.ts does NOT call kernel directly.
			void (async () => {
				if (!this.overrideHandler) {
					await this.rpc.postRaw({
						type: 'record_override.response',
						payload: { ok: false, error: 'override handler not registered (save-gate not active)' },
					});
					return;
				}
				const result = await this.overrideHandler({
					change_id: msg.payload.change_id,
					contract_node_id: msg.payload.contract_node_id,
					section_name: msg.payload.section_name,
					note: msg.payload.note,
				});
				await this.rpc.postRaw({
					type: 'record_override.response',
					payload: result,
				});
				// On success, also resolve the pending decision so the modal closes.
				if (result.ok && this.pendingResolve) {
					this.pendingResolve({
						kind: 'accept',
						change_id: msg.payload.change_id,
						accept_latency_ms: 0,
					});
					this.pendingResolve = undefined;
					this.pendingReject = undefined;
				}
			})();
			return;
		}
		if (msg.type === 'canvas.requestAddDecisionNode') {
			// Phase 17 Plan 17-03 POLISH-03 — route the empty-state CTA to the placeholder authoring command.
			// The command is registered in extension.ts activate() and shows a v2.1
			// informational message body. Pattern matches the existing if-chain at lines
			// 333-361 (canvas.ready, citation.explain, reveal_line, canvas.requestRationale).
			void vscode.commands.executeCommand('goatide.canvas.addDecisionNode');
			return;
		}
		if (!this.pendingResolve) {
			return;   // stale message after the promise already resolved
		}
		if (msg.type === 'canvas.accept') {
			this.pendingResolve({
				kind: 'accept',
				change_id: msg.payload.change_id,
				accept_latency_ms: msg.payload.accept_latency_ms,
			});
		} else if (msg.type === 'canvas.reject') {
			this.pendingResolve({ kind: 'reject', change_id: msg.payload.change_id });
		} else if (msg.type === 'canvas.reject_with_note') {
			this.pendingResolve({
				kind: 'reject_with_note',
				change_id: msg.payload.change_id,
				note: msg.payload.note,
			});
		}
		this.pendingResolve = undefined;
		this.pendingReject = undefined;
	}

	private buildHtml(): string {
		const htmlPath = path.join(this.extensionUri.fsPath, 'dist', 'canvas', 'index.html');
		// In dev, the html may live at src/canvas/webview/index.html; copied to dist by esbuild
		// (esbuild.config.mjs has a fs.copyFileSync step after build).
		let template: string;
		try {
			template = fs.readFileSync(htmlPath, 'utf8');
		} catch {
			// Fallback: read from source path (build hasn't run).
			template = fs.readFileSync(
				path.join(this.extensionUri.fsPath, 'src', 'canvas', 'webview', 'index.html'),
				'utf8',
			);
		}
		const nonce = crypto.randomBytes(16).toString('base64').replace(/\W/g, '').slice(0, 32);
		const cspSource = this.panel.webview.cspSource;
		const indexJsUri = this.panel.webview
			.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'canvas', 'index.js'))
			.toString();
		const indexCssUri = this.panel.webview
			.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'dist', 'canvas', 'index.css'))
			.toString();
		// Substitute placeholders. The HTML uses ${webview.cspSource}/index.js (and /index.css)
		// for asset URIs; we swap those to the asWebviewUri-converted URLs that the renderer can load.
		return template
			.replaceAll('${nonce}', nonce)
			.replaceAll('${webview.cspSource}/index.js', indexJsUri)
			.replaceAll('${webview.cspSource}/index.css', indexCssUri)
			.replaceAll('${webview.cspSource}', cspSource);
	}
}
