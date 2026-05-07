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

interface SubmitObservationArg {
	id: string;
	source: string;
	body?: string;
	output?: string;
	exit_code?: number | null;
	cwd?: string | null;
	file_path?: string;
	language?: string;
	line_count?: number;
	ts: string;
	detail?: { working_set_size?: number; confidence?: number; truncated?: boolean };
}

/**
 * Structural shape of the kernel client surface used by Phase-5 bridge watchers. The
 * concrete KernelClient (src/kernel/client.ts) gains harvesterSubmitObservation in a
 * downstream plan; structural typing keeps Plan 05-04 independent of that wiring.
 */
export interface HarvesterKernelClient {
	harvesterSubmitObservation: (obs: SubmitObservationArg) => Promise<unknown>;
}

/**
 * Wire all bridge-side telemetry watchers. Idempotent registration — each watcher pushes
 * its disposables onto ctx.subscriptions so VS Code tears them down on extension dispose.
 */
export function registerHarvester(
	ctx: vscode.ExtensionContext,
	kernel: HarvesterKernelClient,
): void {
	registerEditorEventWatcher(ctx, kernel);
	registerTerminalEventWatcher(ctx, kernel);
	// Plan 05-03's registerGitEventWatcher is wired in extension.ts directly (Plan 05-03
	// owns extension.ts per file-ownership invariant). Plan 05-07's LivenessBanner will
	// be wired here later.
}
