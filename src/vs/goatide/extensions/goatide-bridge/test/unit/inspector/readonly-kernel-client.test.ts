/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/inspector/readonly-kernel-client.test.ts — Phase 14 Plan 14-01 (Wave-0) +
// Plan 14-02 (Wave-1) — DEEP-05 type-only fence regression suite.
//
// Five invariants that protect the read-only narrowing of KernelClient:
//   1. Object.keys(import * as M) is empty after tsx transpile — no runtime symbols.
//   2. The compiled JS (dist/inspector/ReadonlyKernelClient.js) — if present — does NOT
//      embed the literal `class KernelClient`; only `import type` references should appear.
//   3. KernelClient is assignable to ReadonlyKernelClient (narrowing) but the inverse fails
//      a TypeScript narrow — proved via @ts-expect-error.
//   4. None of the four banned write-RPC method names (atomicAccept / proposeEdit /
//      recordRejection / recordContractOverride) appears in the ReadonlyKernelClient
//      surface — proved via @ts-expect-error.
//   5. Plan 14-02 I1 wave-split: queryRationaleAt IS in the Pick<> — `(c as ReadonlyKernelClient)
//      .queryRationaleAt` is a callable signature, NOT a type error.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as M from '../../../src/inspector/ReadonlyKernelClient.js';
import type { ReadonlyKernelClient } from '../../../src/inspector/ReadonlyKernelClient.js';
import type { KernelClient } from '../../../src/kernel/client.js';
import type {
	QueryRationaleAtParams, QueryRationaleAtResult,
	QueryGraphSnapshotParams, QueryGraphSnapshotResult,
	QueryTimelineTransitionsResult,
} from '../../../src/kernel/methods.js';

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

	it('Plan 14-02 I1 wave-split: queryRationaleAt IS in the Pick<> surface', () => {
		// This line MUST compile cleanly (no @ts-expect-error). If queryRationaleAt was
		// missing from the Pick<>, the call below would error TS2339 and break the build.
		// The runtime call would throw "not a function" — we never reach it; the type
		// assertion is the load-bearing guarantee.
		const r = {} as ReadonlyKernelClient;
		const _call: (p: QueryRationaleAtParams) => Promise<QueryRationaleAtResult> = r.queryRationaleAt;
		void _call;
		// Smoke-assert at runtime that the .ts surface includes queryRationaleAt; reading
		// the source file rather than running it (KernelClient instantiation requires a
		// kernel handle which is out-of-scope for a unit test).
		const sourcePath = path.resolve(__dirname, '..', '..', '..', 'src', 'inspector', 'ReadonlyKernelClient.ts');
		const sourceText = fs.readFileSync(sourcePath, 'utf8');
		assert.ok(
			/'queryRationaleAt'/.test(sourceText),
			'ReadonlyKernelClient.ts Pick<> must include the literal string "queryRationaleAt" (Plan 14-02 I1 wave-split)',
		);
	});

	it('Plan 15-01 I1 wave-split: queryGraphSnapshot IS in the Pick<> surface (DEEP-02)', () => {
		// Type-only assertion — the typed assignment compiles iff queryGraphSnapshot is in
		// the Pick<>. If the method is removed, this line breaks at compile time (TS2339).
		const r = {} as ReadonlyKernelClient;
		const _call: (p: QueryGraphSnapshotParams) => Promise<QueryGraphSnapshotResult> = r.queryGraphSnapshot;
		void _call;
		const sourcePath = path.resolve(__dirname, '..', '..', '..', 'src', 'inspector', 'ReadonlyKernelClient.ts');
		const sourceText = fs.readFileSync(sourcePath, 'utf8');
		assert.ok(
			/'queryGraphSnapshot'/.test(sourceText),
			'ReadonlyKernelClient.ts Pick<> must include the literal string "queryGraphSnapshot" (Plan 15-01 DEEP-02)',
		);
	});

	it('Plan 15-01 I1 wave-split: queryTimelineTransitions IS in the Pick<> surface (DEEP-02)', () => {
		const r = {} as ReadonlyKernelClient;
		const _call: () => Promise<QueryTimelineTransitionsResult> = r.queryTimelineTransitions;
		void _call;
		const sourcePath = path.resolve(__dirname, '..', '..', '..', 'src', 'inspector', 'ReadonlyKernelClient.ts');
		const sourceText = fs.readFileSync(sourcePath, 'utf8');
		assert.ok(
			/'queryTimelineTransitions'/.test(sourceText),
			'ReadonlyKernelClient.ts Pick<> must include the literal string "queryTimelineTransitions" (Plan 15-01 DEEP-02)',
		);
	});
});
