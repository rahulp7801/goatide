/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/harvester/index.ts — Phase 5 Plan 04.
//
// Bridge harvester orchestrator. Single entry point for activate() to wire all bridge-side
// telemetry watchers. Plan 05-03's git-events watcher (TELE-04) is wired separately in
// extension.ts (Plan 05-03 owns extension.ts per file-ownership invariant); Plan 05-07's
// LivenessBanner will be wired here later.
//
// File-ownership: this module + ./editor-events.ts + ./terminal-events.ts are owned by
// Plan 05-04. extension.ts is owned by Plan 05-03 (its activate() calls registerHarvester
// alongside any registerGitEventWatcher 05-03 ships).

import * as vscode from 'vscode';
import { registerEditorEventWatcher } from './editor-events.js';
import { registerTerminalEventWatcher } from './terminal-events.js';
import { LivenessBanner, type LivenessKernelClient } from './liveness-banner.js';
import type { SubmitObservationParams, SubmitObservationResult } from '../kernel/methods.js';

/**
 * Structural shape of the kernel client surface used by Phase-5 bridge watchers. Now
 * that Plan 05-03 has landed harvesterSubmitObservation on KernelClient with the strict
 * RawObservation discriminated-union, this interface mirrors that strict signature so
 * the editor + terminal watchers below get the same type-safety guarantees.
 *
 * Plan 05-07 widens the surface with harvesterGetLiveness (TELE-06 watchdog poll); the
 * intersection with LivenessKernelClient keeps both single-purpose interfaces independent
 * while letting registerHarvester consume one combined client.
 */
export interface HarvesterKernelClient extends LivenessKernelClient {
	harvesterSubmitObservation: (obs: SubmitObservationParams) => Promise<SubmitObservationResult>;
}

/**
 * Wire all bridge-side telemetry watchers + the LivenessBanner. Idempotent registration —
 * each watcher pushes its disposables onto ctx.subscriptions so VS Code tears them down
 * on extension dispose.
 */
export function registerHarvester(
	ctx: vscode.ExtensionContext,
	kernel: HarvesterKernelClient,
): void {
	registerEditorEventWatcher(ctx, kernel);
	registerTerminalEventWatcher(ctx, kernel);
	// Plan 05-07 TELE-06 — LivenessBanner polls kernel.harvesterGetLiveness every 30s
	// (override via env GOATIDE_LIVENESS_POLL_INTERVAL_MS for tests). The banner owns its
	// own setInterval timer + status-bar item; registering it via ctx.subscriptions
	// guarantees disposal on extension teardown.
	const pollIntervalMs = parseIntOrUndefined(process.env.GOATIDE_LIVENESS_POLL_INTERVAL_MS);
	const banner = new LivenessBanner(kernel, pollIntervalMs ? { pollIntervalMs } : {});
	ctx.subscriptions.push(banner);
	// Plan 05-03's registerGitEventWatcher is wired in extension.ts directly (Plan 05-03
	// owns extension.ts per file-ownership invariant).
}

function parseIntOrUndefined(raw: string | undefined): number | undefined {
	if (raw === undefined) {
		return undefined;
	}
	const v = Number.parseInt(raw, 10);
	return Number.isFinite(v) && v > 0 ? v : undefined;
}
