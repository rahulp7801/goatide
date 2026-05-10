/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/test/integration/kernel/kernel-path-resolution.test.ts
//
// Phase 8 Plan 08-00 (Wave 0) — RED stub for BRIDGE-RT-01.
//
// Stat-then-fallback resolver that picks the correct kernel/dist/main.js path regardless of
// whether the bridge is loaded as a built-in extension (extensionUri at
// `<root>/extensions/goatide-bridge`, 2 `..` to <root>) or in dev mode
// (extensionUri at `<root>/src/vs/goatide/extensions/goatide-bridge`, 5 `..` to <root>).
// The current code at src/extension.ts:33 hard-codes 4 `..` and lands at
// `<root>/src/kernel/dist/main.js` — wrong in both modes.
//
// Plan 08-01 (Wave 1) lands `export function resolveKernelPath(extensionUri: vscode.Uri):
// string` and flips these `it.skip` placeholders to real `it()` tests.

import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import * as fs from 'node:fs';

// TODO Wave 1 (Plan 08-01): `resolveKernelPath` does not exist yet on src/extension.ts —
// the import below will resolve once Plan 08-01 adds the named export. Until then, mocha
// loads this file but only encounters `it.skip(...)` so suite still exits 0.
// @ts-expect-error: Wave-1 lands this export (Plan 08-01).
import { resolveKernelPath } from '../../../src/extension.js';

// Reference the symbol so tsc/eslint don't drop the import as unused. The reference is
// inside an `if (false)` so it never executes at runtime.
if (false) { void resolveKernelPath; void path; void fs; void assert; }

describe('BRIDGE-RT-01: kernelPath stat-then-fallback resolver', () => {

	it.skip('resolves to <root>/kernel/dist/main.js when extensionUri is dev-mode (5 .. up)', () => {
		// TODO Wave 1 (Plan 08-01):
		//   const devUri = { fsPath: '/repo/src/vs/goatide/extensions/goatide-bridge' } as vscode.Uri;
		//   const expectedPath = path.normalize('/repo/kernel/dist/main.js');
		//   assert.equal(resolveKernelPath(devUri), expectedPath);
	});

	it.skip('resolves to <root>/kernel/dist/main.js when extensionUri is built-in mode (2 .. up)', () => {
		// TODO Wave 1 (Plan 08-01):
		//   const builtinUri = { fsPath: '/repo/extensions/goatide-bridge' } as vscode.Uri;
		//   const expectedPath = path.normalize('/repo/kernel/dist/main.js');
		//   assert.equal(resolveKernelPath(builtinUri), expectedPath);
	});

	it.skip('throws with both candidates listed when neither file exists', () => {
		// TODO Wave 1 (Plan 08-01):
		//   const orphanUri = { fsPath: '/no/such/path/extensions/goatide-bridge' } as vscode.Uri;
		//   assert.throws(() => resolveKernelPath(orphanUri),
		//     /resolveKernelPath: kernel\/dist\/main\.js not found.*candidates tried/i);
	});
});
