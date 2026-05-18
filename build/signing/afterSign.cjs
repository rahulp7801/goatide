/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Phase 22 C1 (Plan 22-02): electron-builder afterSign hook.
// Calls @electron/notarize notarytool to notarize + staple the .app bundle.
// Short-circuits on non-darwin or missing APPLE_ID env var (cert-absent local build).

'use strict';

const { notarize } = require('@electron/notarize');
const path = require('path');

exports.default = async function afterSign(context) {
	if (context.electronPlatformName !== 'darwin') {
		return;
	}
	if (!process.env.APPLE_ID) {
		console.log('[afterSign] APPLE_ID not set; skipping notarization (cert-absent build)');
		return;
	}

	const appName = context.packager.appInfo.productFilename;
	const appPath = path.join(context.appOutDir, appName + '.app');

	console.log('[afterSign] Notarizing ' + appPath + ' via @electron/notarize notarytool...');
	await notarize({
		appPath,
		appleId: process.env.APPLE_ID,
		appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
		teamId: process.env.APPLE_TEAM_ID,
	});
	console.log('[afterSign] Notarization + .app staple complete.');
};
