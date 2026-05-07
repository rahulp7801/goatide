/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/harvester/editor-events.ts — Phase 5 Plan 04.
//
// TELE-02: Editor event watcher (debounced; Mandate-A coarse-only).
//
// Two VS Code subscriptions feed this watcher:
//
//   1. workspace.onDidChangeTextDocument: maintains a bounded LRU working-set Map keyed by
//      document URI string. The working-set tracks "files the developer is actively editing"
//      so the downstream PORT-01 verifiable predicate can score a save with 30 working files
//      differently from a save with 1 working file. CRITICALLY this handler does NOT submit
//      observations — that's the Mandate-A coarse-only invariant. A future refactor that
//      accidentally adds a kernel.harvesterSubmitObservation call inside the change handler
//      will fail the editor-events.test.ts test 2 invariant.
//
//   2. workspace.onDidSaveTextDocument: fire-and-forget debounce. SAVE_DEBOUNCE_MS = 200ms
//      collapses format-on-save bursts (formatter rewrite + manual save) into a single
//      observation. The handler is synchronous and returns immediately; the actual
//      kernel.harvesterSubmitObservation call happens after the debounce window in a
//      setTimeout callback. Phase-4 onWillSaveTextDocument 1.5s budget DOES NOT apply here:
//      onDidSaveTextDocument is post-save telemetry, not save-lifecycle gating.
//
// Working-set LRU bound (Pitfall 6 memory-leak prevention): WORKING_SET_MAX = 50 distinct
// URIs. When a 51st distinct URI arrives, we evict the entry with the oldest last-edit
// timestamp. Map preserves insertion order; touching an entry via set(uri, Date.now())
// re-inserts it as MRU only if we delete-then-set. We use the simpler "scan for oldest
// timestamp" approach because the working-set never has more than 50 entries — O(50) per
// eviction is negligible compared to the per-keystroke cost we already absorb.
//
// File-ownership: this module exports registerEditorEventWatcher; the bridge harvester
// registry (./index.ts) calls it from registerHarvester. extension.ts is owned by Plan
// 05-03 — its activate() will call registerHarvester (the single entry point that wires
// both this module and ./terminal-events.ts).

import * as vscode from 'vscode';
import { ulid } from 'ulid';

/** Debounce window for collapsing format-on-save + manual save bursts. */
export const SAVE_DEBOUNCE_MS = 200;

/** LRU bound for the working-set Map (Pitfall 6 memory-leak prevention). */
export const WORKING_SET_MAX = 50;

interface SubmitObservationArg {
	id: string;
	source: 'editor_save';
	body: string;
	file_path: string;
	language: string;
	line_count: number;
	ts: string;
	detail?: { working_set_size: number };
}

interface KernelClientLike {
	harvesterSubmitObservation: (obs: SubmitObservationArg) => Promise<unknown>;
}

interface ExtensionContextLike {
	subscriptions: { dispose: () => void }[];
}

/**
 * Wire workspace.onDidChangeTextDocument + workspace.onDidSaveTextDocument to the kernel
 * via debounced editor_save observations. Mandate-A coarse-only — change events maintain
 * the working-set but never submit observations.
 */
export function registerEditorEventWatcher(
	ctx: ExtensionContextLike,
	kernel: KernelClientLike,
): void {
	// uri.toString() -> last-edit timestamp. Used for LRU eviction + as the working_set_size
	// detail field for downstream PORT-01 scoring.
	const workingSet = new Map<string, number>();
	// uri.toString() -> debounce timer handle. Cleared and restarted on every save in the
	// burst window so only the LAST save in the burst actually submits.
	const pendingSaves = new Map<string, NodeJS.Timeout>();

	const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
		const uri = e.document.uri.toString();
		workingSet.set(uri, Date.now());
		if (workingSet.size > WORKING_SET_MAX) {
			// Evict oldest by timestamp. Because Date.now() ticks roughly monotonically and
			// every set() refreshes the timestamp, the entry with the smallest ts is the
			// least-recently-touched one — that's the LRU victim.
			let oldestUri: string | undefined;
			let oldestTs = Number.POSITIVE_INFINITY;
			for (const [k, ts] of workingSet) {
				if (ts < oldestTs) {
					oldestTs = ts;
					oldestUri = k;
				}
			}
			if (oldestUri !== undefined) {
				workingSet.delete(oldestUri);
			}
		}
	});

	const saveSub = vscode.workspace.onDidSaveTextDocument((doc) => {
		const uri = doc.uri.toString();
		// Cancel any pending timer for this uri so the burst collapses into one submit.
		const existing = pendingSaves.get(uri);
		if (existing !== undefined) {
			clearTimeout(existing);
		}
		const timer = setTimeout(() => {
			pendingSaves.delete(uri);
			const obs: SubmitObservationArg = {
				id: ulid(),
				source: 'editor_save',
				body: '',
				file_path: doc.uri.fsPath,
				language: doc.languageId,
				line_count: doc.lineCount,
				ts: new Date().toISOString(),
				detail: { working_set_size: workingSet.size },
			};
			// Fire-and-forget. Phase-4 Pitfall 1.5s budget does not apply (post-save event),
			// but a hung kernel must NOT block whatever the editor is doing next, so we
			// explicitly drop the promise. RPC failures land in the kernel's structured logs.
			void kernel.harvesterSubmitObservation(obs).catch((err) => {
				console.error('[goatide-bridge] editor-events submitObservation failed', err);
			});
		}, SAVE_DEBOUNCE_MS);
		pendingSaves.set(uri, timer);
	});

	ctx.subscriptions.push(changeSub);
	ctx.subscriptions.push(saveSub);
	// Clear any in-flight debounce timers on extension dispose to avoid late firings into
	// a torn-down kernel client.
	ctx.subscriptions.push({
		dispose: () => {
			for (const t of pendingSaves.values()) {
				clearTimeout(t);
			}
			pendingSaves.clear();
			workingSet.clear();
		},
	});
}
