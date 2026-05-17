/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Phase 19 Plan 19-01 WALK-01 -- Wave-0 RED stub. Flips GREEN when Plan 19-02
// Task 1 adds `contributes.configurationDefaults["workbench.startupEditor"]:
// "none"` to the bridge package.json. Research source: 19-RESEARCH.md Wave-0
// Imperative #1 (HIGH confidence: scope RESOURCE allowed; primary fix route).

const PKG_PATH = path.resolve(__dirname, '..', '..', 'package.json');

describe('Phase 19 WALK-01 -- configurationDefaults', () => {
	it('declares workbench.startupEditor === "none" so GoatIDE walkthrough wins first-launch foreground', () => {
		const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));
		const defaults = pkg.contributes?.configurationDefaults;
		assert.ok(
			defaults,
			'contributes.configurationDefaults must be declared in bridge package.json (Phase 19 WALK-01 primary fix; 19-RESEARCH.md Imperative #1)',
		);
		assert.strictEqual(
			defaults['workbench.startupEditor'],
			'none',
			'workbench.startupEditor default must be "none" to suppress VS Code StartupPageRunnerContribution.run open-welcome branches (startupPage.ts:140-149 — only welcomePage|welcomePageInEmptyWorkbench|readme|terminal trigger; "none" falls through)',
		);
	});
});
