/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { initGoatIdeUpdater } from '../goatideUpdater.js';

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

	// Plan 22-04 will extend this file with 'update-downloaded restart' and
	// 'update-downloaded later' it() blocks once electron-updater is wired.

});
