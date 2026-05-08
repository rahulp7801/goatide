/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/drift/registry.spec.ts — Phase 7 (Plan 07-02) DRIFT-01 contract registry.
//
// loadContractRegistry queries all active ContractNodes via dao.queryByKind('ContractNode',
// asOf), parses each payload via Zod, and indexes them by contract_path + id + flat
// allPatterns list. Pitfall 1 (07-RESEARCH.md): registry skips ContractNodes without
// contract_path (logs warning) and ContractNodes whose payload.patterns is undefined
// (legitimate — pre-Phase-7 contracts).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { makeDriftHarness, type DriftHarness } from './_setup.js';
import { loadContractRegistry } from '../../drift/registry.js';

describe('drift/registry — Plan 07-02 (DRIFT-01 contract registry)', () => {
	let harness: DriftHarness;

	beforeEach(() => {
		harness = makeDriftHarness();
	});

	afterEach(() => {
		harness.cleanup();
	});

	it('loadContractRegistry queries all active ContractNodes via dao.queryByKind', async () => {
		const apiId = harness.seedContractFixture('api-security');
		const tokensId = harness.seedContractFixture('design-tokens');
		const depsId = harness.seedContractFixture('dependency-rules');

		const asOf = new Date().toISOString();
		const reg = await loadContractRegistry(harness.dao, asOf);

		expect(reg.byId.size).toBe(3);
		expect(reg.byId.has(apiId)).toBe(true);
		expect(reg.byId.has(tokensId)).toBe(true);
		expect(reg.byId.has(depsId)).toBe(true);
	});

	it('registry indexes by contract_path for byPath.has() lookup', async () => {
		harness.seedContractFixture('api-security');
		harness.seedContractFixture('design-tokens');
		harness.seedContractFixture('dependency-rules');

		const asOf = new Date().toISOString();
		const reg = await loadContractRegistry(harness.dao, asOf);

		expect(reg.byPath.has('/contracts/api_security.md')).toBe(true);
		expect(reg.byPath.has('/contracts/design_tokens.md')).toBe(true);
		expect(reg.byPath.has('/contracts/dependency_rules.md')).toBe(true);
	});

	it('allPatterns flattens patterns across contracts with correct contractNodeId + index linkage', async () => {
		const apiId = harness.seedContractFixture('api-security');
		harness.seedContractFixture('design-tokens'); // 3 patterns
		harness.seedContractFixture('dependency-rules'); // 6 patterns

		const asOf = new Date().toISOString();
		const reg = await loadContractRegistry(harness.dao, asOf);

		// 1 + 3 + 6 = 10 pattern entries
		expect(reg.allPatterns).toHaveLength(10);

		// api-security has exactly one regex pattern at index 0
		const apiPatterns = reg.allPatterns.filter((p) => p.contractNodeId === apiId);
		expect(apiPatterns).toHaveLength(1);
		expect(apiPatterns[0].patternIndex).toBe(0);
		expect(apiPatterns[0].pattern.kind).toBe('regex');
		expect(apiPatterns[0].contractAnchorFile).toBe('/contracts/api_security.md');
	});

	it('skips ContractNodes without contract_path (logs warning; not in byPath)', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { /* swallow */ });

		// Seed a contract WITHOUT contract_path (legacy Phase-2..6 shape).
		const seed = harness.dao.seed({
			payload: {
				kind: 'ContractNode',
				body: 'Legacy contract without contract_path.',
				anchor: { file: '/legacy/anchor.md' },
				// contract_path intentionally omitted
			},
			provenance: { source: 'cli', actor: 'registry-test' },
		});

		const asOf = new Date().toISOString();
		const reg = await loadContractRegistry(harness.dao, asOf);

		// The legacy contract is NOT registered in byPath (no key to index by).
		expect(reg.byPath.size).toBe(0);
		// But it IS registered in byId so lock-detector / ripple paths can still find it.
		expect(reg.byId.has(seed.id)).toBe(true);
		expect(warnSpy).toHaveBeenCalled();

		warnSpy.mockRestore();
	});

	it('skips ContractNodes whose payload.patterns is undefined (no entry in allPatterns; node still in byPath/byId)', async () => {
		// Seed a contract WITH contract_path but WITHOUT patterns (lock-only contract).
		const seed = harness.dao.seed({
			payload: {
				kind: 'ContractNode',
				body: '# Lock-only contract\n\nNo patterns; section-lock only.',
				anchor: { file: '/contracts/lock_only.md' },
				contract_path: '/contracts/lock_only.md',
				enforcing_sections: ['Heading'],
				// patterns intentionally omitted
			},
			provenance: { source: 'cli', actor: 'registry-test' },
		});

		const asOf = new Date().toISOString();
		const reg = await loadContractRegistry(harness.dao, asOf);

		expect(reg.byPath.has('/contracts/lock_only.md')).toBe(true);
		expect(reg.byId.has(seed.id)).toBe(true);
		// allPatterns must NOT contain any entry for this contract.
		expect(reg.allPatterns.filter((p) => p.contractNodeId === seed.id)).toEqual([]);
	});

	it('skips superseded (invalidated) ContractNodes when asOf is current', async () => {
		const oldId = harness.seedContractFixture('api-security');

		// Supersede the api-security contract with a tiny replacement (no patterns).
		harness.dao.supersede(oldId, {
			kind: 'ContractNode',
			body: 'Superseded version.',
			anchor: { file: '/contracts/api_security.md' },
			contract_path: '/contracts/api_security.md',
		});

		const asOf = new Date().toISOString();
		const reg = await loadContractRegistry(harness.dao, asOf);

		// Only the new (active) contract is in the registry.
		expect(reg.byId.has(oldId)).toBe(false);
		expect(reg.byPath.has('/contracts/api_security.md')).toBe(true);
		// The new contract has no patterns → allPatterns has 0 entries.
		expect(reg.allPatterns).toEqual([]);
	});
});
