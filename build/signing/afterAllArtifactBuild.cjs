/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Phase 22 C1 (Plan 22-02): electron-builder afterAllArtifactBuild hook.
// Runs `xcrun stapler staple` on every .dmg artifact so offline installs validate
// without Apple CDN access. Mitigates Pitfall 1 (.dmg not stapled after .app staple).
// Short-circuits on non-darwin.

'use strict';

const { execSync } = require('child_process');

exports.default = async function afterAllArtifactBuild(context) {
	if (process.platform !== 'darwin') {
		return;
	}
	const artifacts = context.artifactPaths || [];
	const dmgArtifacts = artifacts.filter(p => p.endsWith('.dmg'));
	if (dmgArtifacts.length === 0) {
		console.log('[afterAllArtifactBuild] No .dmg artifacts to staple');
		return;
	}
	for (const artifact of dmgArtifacts) {
		console.log('[afterAllArtifactBuild] Stapling ' + artifact);
		execSync('xcrun stapler staple "' + artifact + '"', { stdio: 'inherit' });
	}
};
