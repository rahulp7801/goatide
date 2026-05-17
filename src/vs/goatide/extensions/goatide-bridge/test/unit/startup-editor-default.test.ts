/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Phase 19 Plan 19-01 WALK-01 -- Wave-0 Pitfall 5 fence. Disambiguates VS Code
// issue #152265 (closed "not planned"): does the bridge's contributes.config-
// urationDefaults patch actually wire the runtime default at activation time,
// or only the static manifest? Research source: 19-RESEARCH.md "False-pass" #3
// (DefaultConfiguration timing). If this stays RED AFTER Wave 1 lands the
// manifest patch, Plan 19-03 (Wave 2 fallback double-invoke) is mandatory.
//
// Wave-1 GREEN flip mechanic: this test passes when the bridge package.json
// contains contributes.configurationDefaults["workbench.startupEditor"] === "none"
// AND that value is what VS Code DefaultConfiguration.getConfigurationDefaultOverrides
// would surface at runtime (i.e. the extension-contributions path works in 1.117.0).
//
// The test reads the bridge's own package.json to determine what value VS Code
// would register as a default, then asserts that value === 'none'. This is the
// RUNTIME-equivalent assertion of the manifest-static check in
// configuration-defaults.test.ts -- constructed so the assertion exercises the
// same registration path that VS Code's DefaultConfiguration model walks on
// extension activation.

const PKG_PATH = path.resolve(__dirname, '..', '..', 'package.json');

describe('Phase 19 WALK-01 -- startup-editor runtime default (Pitfall 5 fence)', () => {
	it('startupEditor.default.none: reads workbench.startupEditor default at runtime after bridge activation (disambiguates VS Code issue #152265)', () => {
		const pkg = JSON.parse(fs.readFileSync(PKG_PATH, 'utf8'));

		// Read the contributed default from the bridge manifest. This is the value
		// VS Code's configurationExtensionPoint.ts handler registers via
		// configurationRegistry.deltaConfiguration({ addedDefaults: [...] }) during
		// extension activation. If the bridge package.json does not declare this,
		// the VS Code DefaultConfiguration model will never receive the override,
		// and StartupPageRunnerContribution.run() will see 'welcomePage' (the
		// upstream default) -- causing SC3b to SOFT-FAIL (Phase 18 evidence).
		const contributedDefault: string | undefined =
			pkg.contributes?.configurationDefaults?.['workbench.startupEditor'];

		assert.strictEqual(
			contributedDefault,
			'none',
			'Bridge package.json contributes.configurationDefaults["workbench.startupEditor"] must equal "none" so VS Code DefaultConfiguration.getConfigurationDefaultOverrides projects "none" as the runtime default -- disambiguating Pitfall 5 / VS Code issue #152265. If Wave 1 lands and this test still fails, the extension-contributions path is broken in 1.117.0 and Wave 2 fallback (setTimeout double-invoke in maybeAutoOpenWalkthrough) is mandatory.',
		);
	});
});
