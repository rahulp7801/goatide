/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Phase 22 C1 (Plan 22-02): electron-builder beforeSign hook.
// Re-signs all .node native modules with hardened runtime BEFORE main .app codesign.
// Mitigates Pitfall 2 (nested .node files signed by Phase 13 postinstall identity).
// Short-circuits on non-darwin or missing mac.identity (cert-absent local build).

'use strict';

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Recursively enumerate all .node files under a directory.
 * @param {string} dir Absolute path to scan.
 * @returns {string[]} Absolute paths of all .node files.
 */
function findNodeFiles(dir) {
	const out = [];
	if (!fs.existsSync(dir)) {
		return out;
	}
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			out.push(...findNodeFiles(full));
		} else if (entry.isFile() && entry.name.endsWith('.node')) {
			out.push(full);
		}
	}
	return out;
}

exports.default = async function beforeSign(context) {
	if (process.platform !== 'darwin') {
		return;
	}
	const identity = context.packager.config.mac && context.packager.config.mac.identity;
	if (!identity) {
		console.log('[beforeSign] No mac.identity set; skipping .node re-sign (cert-absent build)');
		return;
	}

	const appName = context.packager.appInfo.productFilename;
	const appPath = path.join(context.appOutDir, appName + '.app');

	const candidateRoots = [
		path.join(appPath, 'Contents', 'Resources', 'app', 'kernel'),
		path.join(appPath, 'Contents', 'Resources', 'app', 'remote'),
		path.join(appPath, 'Contents', 'Resources', 'app.asar.unpacked'),
	];

	/** @type {string[]} */
	const nodeFiles = [];
	for (const root of candidateRoots) {
		nodeFiles.push(...findNodeFiles(root));
	}

	console.log('[beforeSign] Re-signing ' + nodeFiles.length + ' .node files with identity: ' + identity);
	for (const f of nodeFiles) {
		execSync(
			'codesign --force --deep --sign "' + identity + '" --options runtime --entitlements build/signing/entitlements.mac.inherit.plist "' + f + '"',
			{ stdio: 'inherit' }
		);
	}
};
