/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/test/integration/kernel/kernel-path-resolution.test.ts
//
// Phase 8 Plan 08-01 (Wave 1) — BRIDGE-RT-01 stat-then-fallback resolver tests (live).
//
// resolveKernelPath() picks the correct <root>/kernel/dist/main.js regardless of whether
// the bridge is loaded as a built-in extension (extensionUri at
// `<root>/extensions/goatide-bridge`, 2 `..` to <root>) or in dev mode
// (extensionUri at `<root>/src/vs/goatide/extensions/goatide-bridge`, 5 `..` to <root>).
//
// Wave-0 (Plan 08-00) seeded these as `it.skip(...)`; Wave-1 (this plan) lands the
// `export function resolveKernelPath` in src/extension.ts and flips them to live `it()`.

import * as assert from 'node:assert/strict';
import * as path from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import type * as vscode from 'vscode';

import { resolveKernelPath } from '../../../src/extension.js';

describe('BRIDGE-RT-01: kernelPath stat-then-fallback resolver', () => {
	let tmpRoot: string;
	const fakeUri = (fsPath: string): vscode.Uri => ({ fsPath } as vscode.Uri);

	beforeEach(() => {
		tmpRoot = mkdtempSync(path.join(tmpdir(), 'goatide-bridge-rt-01-'));
	});
	afterEach(() => {
		try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
	});

	it('resolves to <root>/kernel/dist/main.js when extensionUri is dev-mode (5 .. up)', () => {
		const devExtUri = path.join(tmpRoot, 'src', 'vs', 'goatide', 'extensions', 'goatide-bridge');
		const expectedKernel = path.join(tmpRoot, 'kernel', 'dist', 'main.js');
		mkdirSync(devExtUri, { recursive: true });
		mkdirSync(path.dirname(expectedKernel), { recursive: true });
		writeFileSync(expectedKernel, '// fake kernel main');

		const result = resolveKernelPath(fakeUri(devExtUri));
		assert.equal(result, expectedKernel);
	});

	it('resolves to <root>/kernel/dist/main.js when extensionUri is built-in mode (2 .. up)', () => {
		const builtinExtUri = path.join(tmpRoot, 'extensions', 'goatide-bridge');
		const expectedKernel = path.join(tmpRoot, 'kernel', 'dist', 'main.js');
		mkdirSync(builtinExtUri, { recursive: true });
		mkdirSync(path.dirname(expectedKernel), { recursive: true });
		writeFileSync(expectedKernel, '// fake kernel main');

		const result = resolveKernelPath(fakeUri(builtinExtUri));
		assert.equal(result, expectedKernel);
	});

	it('throws with both candidates listed when neither file exists', () => {
		const orphanUri = path.join(tmpRoot, 'somewhere', 'else');
		mkdirSync(orphanUri, { recursive: true });
		// No kernel/dist/main.js created in tmpRoot.

		assert.throws(
			() => resolveKernelPath(fakeUri(orphanUri)),
			(err: Error) => {
				assert.match(err.message, /kernelPath resolution failed/);
				assert.match(err.message, /Tried:/);
				// Both candidate paths should appear in the message (5-up and 2-up both end
				// at kernel/dist/main.js, separated by ' AND '). Use [\s\S] to match across
				// any platform-specific path separators between the two occurrences.
				assert.match(err.message, /kernel[\\/]dist[\\/]main\.js[\s\S]*AND[\s\S]*kernel[\\/]dist[\\/]main\.js/);
				return true;
			},
		);
	});
});
