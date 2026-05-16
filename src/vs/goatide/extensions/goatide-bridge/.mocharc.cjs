/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Mocha config for the goatide-bridge extension - Phase 4 (Plan 04-03).
//
// node-option: ['import=tsx'] forwards mocha 11 to `node --import tsx`, which uses tsx 4.21's
// `./esm` exports entry to transpile .ts/.tsx test files (Plan 04-01 deviation: tsx 4.21
// dropped the `tsx/register` subpath). The `file:` array loads jsdom-setup BEFORE any .test.tsx
// file imports React, so RTL's render() works under jsdom without manual per-test wiring.
// .cjs spec entries cover the webview-build smoke test which runs without tsx.

module.exports = {
	'node-option': ['import=tsx'],
	extension: ['ts', 'tsx', 'cjs'],
	spec: ['test/**/*.test.ts', 'test/**/*.test.tsx', 'test/**/*.test.cjs'],
	file: ['test/setup/vscode-stub.ts', 'test/setup/register-commands.ts', 'test/setup/jsdom-setup.ts'],
	recursive: true,
	timeout: 15_000,
	ui: 'bdd',
	reporter: 'spec',
};
