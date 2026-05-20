/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { createRequire } from 'node:module';

// Phase 22 UAT 2026-05-20: the production main.js bundle is ESM ("type": "module"
// in package.json). Bare `require('electron-updater')` inside a lazy-load function
// throws `Error: Dynamic require of "electron-updater" is not supported` -- ESM
// modules cannot use CJS dynamic require. Use createRequire(import.meta.url) to
// produce a CJS-compatible require fn that DOES work inside ESM. Tests still
// override `_autoUpdaterProvider.get` so the actual `requireCjs(...)` call in
// production never fires in renderer-process test context.
const requireCjs = createRequire(import.meta.url);

/**
 * Minimal interface for the autoUpdater API surface used by GoatIDE.
 * Using an interface rather than a direct `electron-updater` import avoids loading
 * electron-updater (a main-process-only library) in renderer-process test contexts.
 *
 * @internal
 */
export interface IAutoUpdaterApi {
	autoDownload: boolean;
	autoInstallOnAppQuit: boolean;
	on(event: 'update-downloaded', listener: (info: unknown) => void): this;
	checkForUpdatesAndNotify(): Promise<unknown>;
	quitAndInstall(silent: boolean, forceRunAfter: boolean): void;
}

/**
 * Lazily loads the `autoUpdater` from `electron-updater`. Loaded lazily so that
 * the main module body does not try to resolve `electron-updater` in renderer-process
 * unit test contexts (electron-updater calls `electron.app.getVersion()` at module load,
 * which is unavailable in the renderer). Tests replace `_autoUpdaterProvider` with a stub.
 *
 * @internal Exported for testing only -- do not use outside of tests.
 */
export const _autoUpdaterProvider: { get(): IAutoUpdaterApi } = {
	get() {
		const { autoUpdater } = requireCjs('electron-updater') as { autoUpdater: IAutoUpdaterApi };
		return autoUpdater;
	}
};

/**
 * Options for `dialog.showMessageBox` used by the update-downloaded handler.
 */
interface IShowMessageBoxOptions {
	type?: string;
	title?: string;
	message: string;
	buttons: string[];
	defaultId?: number;
	cancelId?: number;
}

/**
 * Lazily loads the Electron `dialog` API. The dialog API is a main-process-only
 * Electron API; it is not available in the renderer process. Loading it lazily via
 * a testable indirection allows unit tests (which run in the renderer) to replace
 * `_dialogApi.showMessageBox` with a stub without importing 'electron' directly.
 *
 * @internal Exported for testing only -- do not use outside of tests.
 */
export const _dialogApi: {
	showMessageBox(options: IShowMessageBoxOptions): Promise<{ response: number; checkboxChecked: boolean }>;
} = {
	showMessageBox(options: IShowMessageBoxOptions) {
		const { dialog } = requireCjs('electron') as typeof import('electron');
		return dialog.showMessageBox(options as Parameters<typeof dialog.showMessageBox>[0]);
	}
};

/**
 * Initializes the GoatIDE auto-updater against GitHub Releases. Phase 22 C3.
 *
 * Behavior:
 *  - VSCODE_DEV guard: no-ops in dev-checkout launches (HARDEN-06 pattern).
 *  - autoDownload: true -- electron-updater downloads the update in the background.
 *  - autoInstallOnAppQuit: false -- Mandate D spirit; even on user-initiated quit,
 *    the update applies ONLY after explicit user consent via the Restart Now button.
 *  - update-downloaded handler: shows a modal dialog with ['Restart Now', 'Later'] buttons.
 *    Restart Now (response 0): calls autoUpdater.quitAndInstall(false, true).
 *    Later (response 1): does nothing. Update remains downloaded; the user must
 *    relaunch and click Restart Now next time (or wait for the next update check).
 *
 * Call site: end of CodeApplication.startup() in src/vs/code/electron-main/app.ts.
 *
 * Pitfall H mitigation: VS Code's IUpdateService is no-op'd by GoatIdeNoOpUpdateService
 * (Plan 22-01). electron-updater talks to GitHub Releases (not code.visualstudio.com),
 * so Phase 18 SC13 regression gate (zero code.visualstudio.com requests) remains GREEN.
 *
 * Known limitation: on Windows, if the kernel daemon holds an open file handle to
 * kernel/dist/main.js at the time of quitAndInstall, the NSIS installer may fail to
 * overwrite the file. The user must retry. An explicit kernel-shutdown RPC across
 * electron-main / extension host / kernel is deferred to v2.2. Electron's will-quit
 * event naturally reaps child processes; for most cases this is sufficient.
 *
 * TODO: Externalize user-facing strings (title, message, buttons) with nls.localize()
 * once the nls framework is confirmed available in this electron-main context.
 */
export function initGoatIdeUpdater(): void {
	// HARDEN-06 pattern: never run the auto-updater in dev-checkout launches.
	// Plan 22-01 Wave-0 sentry -- MUST remain the first executable statement.
	if (process.env['VSCODE_DEV']) {
		return;
	}

	const autoUpdater = _autoUpdaterProvider.get();

	autoUpdater.autoDownload = true;
	autoUpdater.autoInstallOnAppQuit = false; // Mandate D: never auto-restart

	autoUpdater.on('update-downloaded', (_info) => {
		_dialogApi.showMessageBox({
			type: 'info',
			title: 'Update Ready',
			message: 'A new version of GoatIDE has been downloaded. Restart now to apply, or restart later.',
			buttons: ['Restart Now', 'Later'],
			defaultId: 0,
			cancelId: 1,
		}).then(({ response }) => {
			if (response === 0) {
				// false = not silent (show installer UI on Windows); true = forceRunAfter
				autoUpdater.quitAndInstall(false, true);
			}
			// response === 1 (Later): do nothing. autoInstallOnAppQuit=false means
			// the update will NOT silently apply on next quit; the user must explicitly
			// click Restart Now after the next update-downloaded event.
		});
	});

	// Kick off the update check. Errors are non-fatal -- never crash the app on an
	// update-check failure (network issues, GitHub rate limits, malformed YAML).
	autoUpdater.checkForUpdatesAndNotify().catch(_err => {
		// Non-fatal.
	});
}
