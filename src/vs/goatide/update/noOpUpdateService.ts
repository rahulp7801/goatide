/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../base/common/event.js';
import { DisablementReason, IUpdateService, State } from '../../platform/update/common/update.js';

/**
 * GoatIDE no-op implementation of VS Code's `IUpdateService`.
 *
 * ## Pitfall H — dual-updater crash prevention
 * GoatIDE ships `electron-updater` (Plan 22-04) as its sole auto-update mechanism.
 * VS Code's built-in platform-specific update services (Win32UpdateService,
 * LinuxUpdateService, DarwinUpdateService) poll `code.visualstudio.com` and write
 * platform-specific state machines that conflict with electron-updater. Registering
 * this no-op in the DI container (src/vs/code/electron-main/app.ts `initServices()`)
 * before any electron-updater code is wired guarantees that nothing polls
 * `code.visualstudio.com` or races with electron-updater.
 *
 * ## Origin
 * @see .planning/REQUIREMENTS.md#C3 — Phase 22 C3 distribution requirement.
 * Plan 22-04 will flesh out `goatideUpdater.ts` (the electron-updater wrapper);
 * this class exists as a permanent no-op fence for VS Code's update machinery.
 *
 * ## Why `State.Disabled`?
 * All seven methods are no-ops so that any VS Code caller that bypasses the `state`
 * check (e.g., command palette "Check for Updates") silently does nothing rather
 * than throwing. The `state` returns `Disabled` so command-palette entries that check
 * `state.type` hide themselves automatically.
 */
export class GoatIdeNoOpUpdateService implements IUpdateService {

	declare readonly _serviceBrand: undefined;

	readonly onStateChange = Event.None;

	get state() {
		return State.Disabled(DisablementReason.DisabledByEnvironment);
	}

	async checkForUpdates(_explicit: boolean): Promise<void> { }

	async downloadUpdate(_explicit: boolean): Promise<void> { }

	async applyUpdate(): Promise<void> { }

	async quitAndInstall(): Promise<void> { }

	async isLatestVersion(): Promise<boolean | undefined> {
		return undefined;
	}

	async _applySpecificUpdate(_packagePath: string): Promise<void> { }

	async setInternalOrg(_internalOrg: string | undefined): Promise<void> { }
}
