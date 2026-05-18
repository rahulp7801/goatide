/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * GoatIDE auto-updater initialization. Phase 22 C3.
 * Plan 22-04 will land the electron-updater wiring; this Wave-0 file establishes
 * the VSCODE_DEV guard + the module location.
 */

/**
 * Initializes the GoatIDE auto-updater.
 *
 * No-ops when `VSCODE_DEV` is set (HARDEN-06 dev-mode guard pattern). Plan 22-04
 * will add electron-updater event handling for `update-downloaded` + the
 * 'Restart Now / Later' dialog (Mandate D spirit — never auto-restart).
 *
 * @see .planning/phases/22-distribution/22-RESEARCH.md Pattern 4 for the canonical
 *      electron-updater body that Plan 22-04 will wire here.
 */
export function initGoatIdeUpdater(): void {
	// HARDEN-06 pattern: never run the auto-updater in dev-checkout launches.
	// Phase 22 Wave 0 -- guard lands BEFORE any electron-updater import.
	if (process.env['VSCODE_DEV']) {
		return;
	}
	// Phase 22 Wave 2 (Plan 22-04) will land electron-updater wiring here:
	//   import { autoUpdater } from 'electron-updater';
	//   autoUpdater.autoDownload = true;
	//   autoUpdater.autoInstallOnAppQuit = false;
	//   autoUpdater.on('update-downloaded', ...) -> showMessageBox -> quitAndInstall
	//   autoUpdater.checkForUpdatesAndNotify();
	// See .planning/phases/22-distribution/22-RESEARCH.md Pattern 4 for the canonical body.
}
