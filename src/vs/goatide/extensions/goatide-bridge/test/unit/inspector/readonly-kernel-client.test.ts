/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/inspector/readonly-kernel-client.test.ts — Phase 14 Plan 14-01 (Wave-0) — DEEP-05
// type-only fence regression suite.
//
// Four invariants that protect the read-only narrowing of KernelClient:
//   1. Object.keys(import * as M) is empty after tsx transpile — no runtime symbols.
//   2. The compiled JS (dist/inspector/ReadonlyKernelClient.js) — if present — does NOT
//      embed the literal `class KernelClient`; only `import type` references should appear.
//   3. KernelClient is assignable to ReadonlyKernelClient (narrowing) but the inverse fails
//      a TypeScript narrow — proved via @ts-expect-error.
//   4. None of the four banned write-RPC method names (atomicAccept / proposeEdit /
//      recordRejection / recordContractOverride) appears in the ReadonlyKernelClient
//      surface — proved via @ts-expect-error.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as M from '../../../src/inspector/ReadonlyKernelClient.js';
import type { ReadonlyKernelClient } from '../../../src/inspector/ReadonlyKernelClient.js';
import type { KernelClient } from '../../../src/kernel/client.js';

describe('Plan 14-01 — ReadonlyKernelClient type-only fence', () => {
	it('exports zero runtime symbols (type-only file)', () => {
		assert.equal(
			Object.keys(M).length,
			0,
			`ReadonlyKernelClient.ts must export zero runtime symbols; observed: ${JSON.stringify(Object.keys(M))}`,
		);
	});

	it('compiled JS (if present) is runtime-empty and does not embed `class KernelClient`', () => {
		// __dirname here resolves under tsx to the .ts file location. The bridge tsconfig
		// emits to <bridge>/dist, mirroring src/. From this test file
		// (<bridge>/test/unit/inspector/) the compiled file sits four directories up at
		// <bridge>/dist/inspector/ReadonlyKernelClient.js.
		const compiled = path.resolve(__dirname, '..', '..', '..', 'dist', 'inspector', 'ReadonlyKernelClient.js');
		if (!fs.existsSync(compiled)) {
			// dist not built yet — the bridge tsc gate (verify step) generates this; the
			// regression sentinel still fires once a build lands.
			return;
		}
		const text = fs.readFileSync(compiled, 'utf8');
		assert.ok(
			!/\bclass\s+KernelClient\b/.test(text),
			`compiled ReadonlyKernelClient.js must not embed \`class KernelClient\` (would mean a bare \`import\` leaked through). Saw:\n${text.slice(0, 400)}`,
		);
	});

	it('KernelClient is assignable to ReadonlyKernelClient (narrowing direction)', () => {
		// Type-level assertion only — runtime no-op. If this line stops compiling, the Pick<>
		// in ReadonlyKernelClient.ts has drifted away from KernelClient's method names.
		const _ok: ReadonlyKernelClient = {} as KernelClient;
		void _ok;
		// Inverse direction must fail — KernelClient cannot be narrowed from
		// ReadonlyKernelClient because the read-only surface is missing the banned write
		// methods that KernelClient declares.
		// @ts-expect-error — ReadonlyKernelClient is missing atomicAccept/proposeEdit/recordRejection/recordContractOverride
		const _bad: KernelClient = {} as ReadonlyKernelClient;
		void _bad;
	});

	it('banned write methods are absent from the ReadonlyKernelClient surface', () => {
		// Each line below MUST trigger TS2339 (property does not exist on ReadonlyKernelClient).
		// If any of these compiles cleanly, the Pick<> accidentally re-included a banned name.
		const r = {} as ReadonlyKernelClient;
		// @ts-expect-error — atomicAccept must not be on ReadonlyKernelClient
		void r.atomicAccept;
		// @ts-expect-error — proposeEdit must not be on ReadonlyKernelClient
		void r.proposeEdit;
		// @ts-expect-error — recordRejection must not be on ReadonlyKernelClient
		void r.recordRejection;
		// @ts-expect-error — recordContractOverride must not be on ReadonlyKernelClient
		void r.recordContractOverride;
	});
});
