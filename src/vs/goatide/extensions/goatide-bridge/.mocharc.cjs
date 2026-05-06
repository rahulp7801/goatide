/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Mocha config for the goatide-bridge extension — Phase-4 Wave-0 (Plan 04-01).
//
// tsx/register lets mocha load .ts/.tsx test files directly; jsdom is initialized per-test
// in the React unit tests (Plan 04-03 wires it; Wave-0 stubs are pure mocha).
// .cjs spec entries cover the webview-build smoke test which runs without tsx.

module.exports = {
	require: ['tsx/register'],
	extension: ['ts', 'tsx', 'cjs'],
	spec: ['test/**/*.test.ts', 'test/**/*.test.tsx', 'test/**/*.test.cjs'],
	recursive: true,
	timeout: 10_000,
	ui: 'bdd',
	reporter: 'spec',
};
