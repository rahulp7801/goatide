/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 17 Plan 17-04 DEEP-06 phase-B — goatide.openCrossRepoGraph command handler.
//
// Extracted from extension.ts activate() so the mocha test setup file can register the
// command WITHOUT calling activate() (which requires a real extension host). Both
// extension.ts and test/setup/register-commands.ts import this module.
//
// Mandate B fence (refuse-deep05-write.sh scope covers inspector/): this file imports
// ZERO write-RPC symbols. The ReadonlyKernelClient surface is structurally enforced.

import * as vscode from 'vscode';
import type { ReadonlyKernelClient } from './ReadonlyKernelClient.js';
import { GraphInspectorPanel } from './panel.js';
import { enumerateWorkspaceRepos } from './workspace-repos.js';

/**
 * Register the `goatide.openCrossRepoGraph` command on the provided
 * `vscode.commands` surface.
 *
 * Returns a {@link vscode.Disposable} that can be added to
 * `context.subscriptions`. The `context` and `kernelClient` parameters are
 * forwarded to {@link GraphInspectorPanel.getOrCreateForCrossRepo} only when the
 * workspace has >= 2 folders; they are never accessed for the single-folder / no-
 * workspace early-return path, so the caller may pass null-coerced stubs in test
 * environments where those objects are unavailable.
 *
 * Graceful degradation: shows an info notification (matching
 * `/No multi-root workspace/i`) when `workspaceFolders` is undefined or has
 * length <= 1.
 *
 * Pitfall 2 avoidance: uses {@link GraphInspectorPanel.getOrCreateForCrossRepo}
 * which returns the SAME singleton as `getOrCreate` (single VIEW_TYPE). The
 * cross-repo distinction is a flag on the show payload, NOT a separate panel.
 */
export function registerCrossRepoGraphCommand(
	context: vscode.ExtensionContext,
	kernelClient: ReadonlyKernelClient,
): vscode.Disposable {
	return vscode.commands.registerCommand('goatide.openCrossRepoGraph', async () => {
		const repos = await enumerateWorkspaceRepos();
		if (repos.length <= 1) {
			await vscode.window.showInformationMessage(
				'GoatIDE: No multi-root workspace detected. Open multiple repositories to use the cross-repo graph view.',
			);
			return;
		}
		const inspector = GraphInspectorPanel.getOrCreateForCrossRepo(context, kernelClient, repos);
		// Optional chaining guards test environments where the patched mock returns undefined.
		inspector?.reveal();
	});
}
