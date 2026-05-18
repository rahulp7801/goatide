/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { initGoatIdeUpdater, _autoUpdaterProvider, _dialogApi, IAutoUpdaterApi } from '../goatideUpdater.js';

suite('initGoatIdeUpdater', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('initGoatIdeUpdater respects VSCODE_DEV guard', () => {
		const previous = process.env['VSCODE_DEV'];
		try {
			process.env['VSCODE_DEV'] = '1';
			// Should return without throwing and without side effects.
			assert.doesNotThrow(() => initGoatIdeUpdater());
		} finally {
			if (previous === undefined) {
				delete process.env['VSCODE_DEV'];
			} else {
				process.env['VSCODE_DEV'] = previous;
			}
		}
	});

	test('initGoatIdeUpdater update-downloaded restart triggers quitAndInstall', async () => {
		// Ensure VSCODE_DEV is unset so the wiring path runs.
		const previousDev = process.env['VSCODE_DEV'];
		delete process.env['VSCODE_DEV'];
		try {
			// Capture the registered 'update-downloaded' handler.
			let downloadedHandler: ((info: unknown) => void) | undefined;
			const quitAndInstallCalls: Array<[unknown, unknown]> = [];

			// Stub autoUpdater via _autoUpdaterProvider.
			const origGet = _autoUpdaterProvider.get;
			const stubAutoUpdater: IAutoUpdaterApi = {
				autoDownload: true,
				autoInstallOnAppQuit: true,
				on(event: 'update-downloaded', handler: (info: unknown) => void): IAutoUpdaterApi {
					if (event === 'update-downloaded') {
						downloadedHandler = handler;
					}
					return stubAutoUpdater;
				},
				checkForUpdatesAndNotify: async () => null,
				quitAndInstall(silent: boolean, forceRunAfter: boolean): void {
					quitAndInstallCalls.push([silent, forceRunAfter]);
				},
			};
			_autoUpdaterProvider.get = () => stubAutoUpdater;

			// Mock _dialogApi.showMessageBox to resolve with response: 0 (Restart Now).
			const origShowMessageBox = _dialogApi.showMessageBox;
			_dialogApi.showMessageBox = async () => ({ response: 0, checkboxChecked: false });

			try {
				initGoatIdeUpdater();
				assert.ok(downloadedHandler, 'update-downloaded handler should be registered');
				// Fire the event.
				downloadedHandler!({ version: '1.0.0' });
				// Allow the .then() microtask to flush.
				await new Promise<void>(resolve => setImmediate(resolve));
				assert.strictEqual(quitAndInstallCalls.length, 1, 'quitAndInstall should be called exactly once');
				assert.deepStrictEqual(quitAndInstallCalls[0], [false, true], 'quitAndInstall called with (false, true)');
			} finally {
				_autoUpdaterProvider.get = origGet;
				_dialogApi.showMessageBox = origShowMessageBox;
			}
		} finally {
			if (previousDev === undefined) {
				delete process.env['VSCODE_DEV'];
			} else {
				process.env['VSCODE_DEV'] = previousDev;
			}
		}
	});

	test('initGoatIdeUpdater update-downloaded later does NOT trigger quitAndInstall', async () => {
		// Same setup as the restart case but dialog resolves with response: 1 (Later).
		const previousDev = process.env['VSCODE_DEV'];
		delete process.env['VSCODE_DEV'];
		try {
			let downloadedHandler: ((info: unknown) => void) | undefined;
			const quitAndInstallCalls: unknown[] = [];

			// Stub autoUpdater via _autoUpdaterProvider.
			const origGet = _autoUpdaterProvider.get;
			const stubAutoUpdater: IAutoUpdaterApi = {
				autoDownload: true,
				autoInstallOnAppQuit: true,
				on(event: 'update-downloaded', handler: (info: unknown) => void): IAutoUpdaterApi {
					if (event === 'update-downloaded') {
						downloadedHandler = handler;
					}
					return stubAutoUpdater;
				},
				checkForUpdatesAndNotify: async () => null,
				quitAndInstall(): void { quitAndInstallCalls.push('called'); },
			};
			_autoUpdaterProvider.get = () => stubAutoUpdater;

			// Mock _dialogApi.showMessageBox to resolve with response: 1 (Later).
			const origShowMessageBox = _dialogApi.showMessageBox;
			_dialogApi.showMessageBox = async () => ({ response: 1, checkboxChecked: false });

			try {
				initGoatIdeUpdater();
				assert.ok(downloadedHandler, 'update-downloaded handler should be registered');
				downloadedHandler!({ version: '1.0.0' });
				await new Promise<void>(resolve => setImmediate(resolve));
				assert.strictEqual(quitAndInstallCalls.length, 0, 'quitAndInstall should NOT be called on Later');
			} finally {
				_autoUpdaterProvider.get = origGet;
				_dialogApi.showMessageBox = origShowMessageBox;
			}
		} finally {
			if (previousDev === undefined) {
				delete process.env['VSCODE_DEV'];
			} else {
				process.env['VSCODE_DEV'] = previousDev;
			}
		}
	});

});
