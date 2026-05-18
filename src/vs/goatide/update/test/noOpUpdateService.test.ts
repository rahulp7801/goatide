/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../base/test/common/utils.js';
import { StateType } from '../../../platform/update/common/update.js';
import { GoatIdeNoOpUpdateService } from '../noOpUpdateService.js';

suite('GoatIdeNoOpUpdateService', () => {

	ensureNoDisposablesAreLeakedInTestSuite();

	test('GoatIdeNoOpUpdateService returns State.Disabled', () => {
		const svc = new GoatIdeNoOpUpdateService();
		assert.strictEqual(svc.state.type, StateType.Disabled);
	});

	test('GoatIdeNoOpUpdateService all methods are no-op', async () => {
		const svc = new GoatIdeNoOpUpdateService();
		await svc.checkForUpdates(true);
		await svc.downloadUpdate(true);
		await svc.applyUpdate();
		await svc.quitAndInstall();
		const v = await svc.isLatestVersion();
		assert.strictEqual(v, undefined);
		await svc._applySpecificUpdate('/tmp/fake');
		await svc.setInternalOrg(undefined);
		// no throw — all methods are no-ops
	});

});
