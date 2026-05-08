/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/graph/payloads.spec.ts — Phase 7 (Plan 07-01) DriftPattern + ContractPayload
// + AttemptPayload extension tests.
//
// Plan 07-01 lands an additive Zod surface:
//   - DriftPattern z.discriminatedUnion('kind', [...]) — three variants (regex/jsonpath/forbidden_import).
//   - ContractPayload gains optional patterns?: DriftPattern[] + enforcing_sections?: string[].
//   - AttemptPayload.attempt_kind JSDoc lists 'contract_override' (no schema change — field stays free-form).
//
// Backward-compatibility is the load-bearing assertion: every Phase-2..6 ContractNode JSON must
// still parse against the extended schema. The DriftPattern union must reject unknown kinds
// (defense-in-depth against a future contributor adding a fourth variant without exhaustiveness).

import { describe, it, expect } from 'vitest';
import { ContractPayload, DriftPattern, AttemptPayload } from '../../graph/payloads.js';

describe('Plan 07-01 — DriftPattern + ContractPayload extensions', () => {
	it('accepts a regex DriftPattern in ContractPayload.patterns', () => {
		const result = ContractPayload.safeParse({
			kind: 'ContractNode',
			body: 'all routes call requireAuth',
			anchor: { file: '/contracts/api_security.md' },
			contract_path: '/contracts/api_security.md',
			patterns: [{ kind: 'regex', pattern: 'requireAuth\\(', required: true, scope: 'src/app/api/**/*.ts' }],
		});
		expect(result.success).toBe(true);
	});

	it('accepts enforcing_sections array of heading strings', () => {
		const result = ContractPayload.safeParse({
			kind: 'ContractNode',
			body: 'OAuth scopes are governed here',
			anchor: { file: '/contracts/api_security.md' },
			enforcing_sections: ['Authentication', 'OAuth Scopes'],
		});
		expect(result.success).toBe(true);
	});

	it('is backward-compatible: pre-Phase-7 ContractNode (no patterns/enforcing_sections) still parses', () => {
		const result = ContractPayload.safeParse({
			kind: 'ContractNode',
			body: 'legacy contract — no Phase-7 fields',
			anchor: { file: '/contracts/legacy.md' },
			contract_path: '/contracts/legacy.md',
		});
		expect(result.success).toBe(true);
	});

	it('DriftPattern rejects unknown kind values', () => {
		const result = DriftPattern.safeParse({ kind: 'fuzzy_match', pattern: 'x' });
		expect(result.success).toBe(false);
	});

	it('DriftPattern accepts each of the three valid variants (regex, jsonpath, forbidden_import)', () => {
		const variants = [
			{ kind: 'regex', pattern: 'foo', required: true },
			{ kind: 'jsonpath', path: '$.token.expiresIn', op: 'eq', value: 3600 },
			{ kind: 'forbidden_import', module: 'string-similarity' },
		];
		const results = variants.map((v) => DriftPattern.safeParse(v).success);
		expect(results).toEqual([true, true, true]);
	});

	it('AttemptPayload accepts attempt_kind="contract_override" (Plan 07-06 free-form value)', () => {
		const result = AttemptPayload.safeParse({
			kind: 'Attempt',
			body: 'developer overrode contract lock — see note',
			anchor: { file: 'src/auth.ts' },
			attempt_kind: 'contract_override',
		});
		expect(result.success).toBe(true);
	});
});
