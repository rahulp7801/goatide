/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 17 Plan 17-01 POLISH-01 -- walkthrough completion handler.
//
// PITFALLS.md Pitfall 9 fence: completion writes to context.globalState -- NEVER
// vscode.workspace.getConfiguration(...).update(...). globalState writes are flushed
// synchronously as part of extension host shutdown; the latter is async and races
// against fast IDE shutdown on Windows %APPDATA% disk flush.

import * as vscode from 'vscode';

const ONBOARDING_KEY = 'goatide.onboardingComplete';
const WALKTHROUGH_ID = 'goatide.goatide-bridge#goatide.onboarding';

/**
 * Register the goatide.onboarding.complete command. Writes the completion flag to
 * context.globalState AND sets the matching `when`-clause context key so the
 * walkthrough is dismissed immediately.
 *
 * PITFALLS.md Pitfall 9 fence: uses context.globalState.update, NOT
 * vscode.workspace.getConfiguration(...).update. See scripts/ci/refuse-deep05-write.sh
 * BANNED array for write-RPC token list (this file is outside inspector/ scope, but
 * the discipline applies: no banned write-RPC calls here either).
 */
export function registerWalkthroughCompletion(context: vscode.ExtensionContext): vscode.Disposable {
	return vscode.commands.registerCommand('goatide.onboarding.complete', async () => {
		// CRITICAL (Pitfall 9): globalState, NOT WorkspaceConfiguration.
		await context.globalState.update(ONBOARDING_KEY, true);
		await vscode.commands.executeCommand('setContext', ONBOARDING_KEY, true);
	});
}

/**
 * Auto-open the walkthrough on first activation. Called from extension.ts activate().
 * After completion, context.globalState.get(ONBOARDING_KEY) returns true and this no-ops.
 */
export async function maybeAutoOpenWalkthrough(context: vscode.ExtensionContext): Promise<void> {
	if (context.globalState.get<boolean>(ONBOARDING_KEY, false)) {
		await vscode.commands.executeCommand('setContext', ONBOARDING_KEY, true);
		return;
	}
	// First invocation: fires immediately. May lose foreground race vs VS Code's
	// StartupPageRunnerContribution.run if our configurationDefaults registration
	// is processed AFTER LifecyclePhase.Restored (Pitfall 5 / VS Code issue #152265).
	await vscode.commands.executeCommand('workbench.action.openWalkthrough', WALKTHROUGH_ID);
	// Phase 19 Plan 19-03 WALK-01 -- belt+suspenders hedge against the race. Per
	// gettingStarted.contribution.ts:87-91, openWalkthrough is idempotent when the
	// walkthrough is already the active category (early-returns as no-op). The 2000ms
	// delay covers paint-cycle completion + VS Code DefaultConfiguration model settle.
	// The globalState fence at the top of this function still gates re-runs on later
	// launches -- the double-invoke ONLY fires on the first-activation path (after the
	// early-return guard has been bypassed).
	setTimeout(() => {
		void vscode.commands.executeCommand('workbench.action.openWalkthrough', WALKTHROUGH_ID);
	}, 2000);
}
