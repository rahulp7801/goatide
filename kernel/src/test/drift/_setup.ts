/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/drift/_setup.ts — Phase 7 (Plan 07-01) makeDriftHarness factory.
//
// Wraps the Phase-2 graph + Phase-5 IntegrationHarness pattern with a contract-registry
// builder helper that seeds the 3 fixture ContractNodes (api-security / design-tokens /
// dependency-rules) on demand. Plans 07-02..07-08 consume this harness to flip the
// Wave-0 it.skip stubs to live tests.
//
// Design constraints:
//   - Fresh better-sqlite3 + drizzle DB per test (mkTempDb + openDatabase pattern).
//   - Both 0006 + 0007 migrations applied (verified by edges-protects.spec.ts in
//     kernel/src/test/graph/).
//   - seedContractFixture(name) is idempotent within a single harness instance — first
//     call seeds, subsequent calls return the same id.
//   - cleanup() closes DB + removes the temp dir (delegates to mkTempDb.dispose()).
//
// Pitfall 8 (07-RESEARCH.md): future fields belong in detail passthrough, NOT new
// top-level ContractPayload fields. The harness fixtures use only the Phase-7 additive
// fields (patterns + enforcing_sections + contract_path) — no detail abuse.

import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO, type OpenDatabaseHandle } from '../../graph/index.js';
import { HarvestMetricsDao } from '../../harvester/metrics.js';
import { ContractPayload } from '../../graph/payloads.js';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = resolve(__dirname, 'fixtures');

export type ContractFixtureName = 'api-security' | 'design-tokens' | 'dependency-rules';

export interface DriftHarnessOptions {
	/** Override the fixture directory (defaults to kernel/src/test/drift/fixtures/). */
	fixtureDir?: string;
	/** Wall-clock millisecond override for deterministic tests (Plan 07-04 ripple-perf, etc.). */
	asOfMs?: number;
	/** Session priority for IntentDrift evaluation (Plan 07-05 consumes). Free-form string. */
	sessionPriority?: string;
}

export interface DriftHarnessFixtures {
	/** Snapshots of seeded ContractNodes (id + parsed payload). Populated by seedContractFixture. */
	contracts: { id: string; payload: z.infer<typeof ContractPayload> }[];
}

export interface DriftHarness {
	tmp: TempDb;
	dbHandle: OpenDatabaseHandle;
	dao: GraphDAO;
	metrics: HarvestMetricsDao;
	fixtures: DriftHarnessFixtures;
	asOfMs: number;
	sessionPriority?: string;
	seedContractFixture(name: ContractFixtureName): string;
	cleanup(): void;
}

interface ContractFixturePayloadJson {
	name: ContractFixtureName;
	contract_path: string;
	body_file: string;
	patterns: unknown[];
	enforcing_sections: string[];
}

/**
 * Construct a fresh drift-test harness backed by a temp DB with both 0006 + 0007 migrations
 * applied. Caller MUST invoke cleanup() in afterEach (or wrap in beforeEach/afterEach).
 *
 * Loading the JSON fixture is deferred to seedContractFixture so harness construction stays
 * synchronous and cheap; tests that don't need fixtures (e.g. pattern-detector unit tests
 * that build their own ContractPayload inline) skip the I/O.
 */
export function makeDriftHarness(opts: DriftHarnessOptions = {}): DriftHarness {
	const tmp = mkTempDb();
	const dbHandle = openDatabase(tmp.dbPath);
	const dao = new GraphDAO(dbHandle.db);
	const metrics = new HarvestMetricsDao(dbHandle.sqlite);

	const fixtureDir = opts.fixtureDir ?? FIXTURES_DIR;
	const fixtures: DriftHarnessFixtures = { contracts: [] };
	const seededByName = new Map<ContractFixtureName, string>();

	function seedContractFixture(name: ContractFixtureName): string {
		const cached = seededByName.get(name);
		if (cached !== undefined) {
			return cached;
		}
		const all = JSON.parse(
			readFileSync(resolve(fixtureDir, 'contract-payloads.json'), 'utf8')
		) as ContractFixturePayloadJson[];
		const entry = all.find((p) => p.name === name);
		if (!entry) {
			throw new Error(`makeDriftHarness: fixture ${name} not present in ${fixtureDir}/contract-payloads.json`);
		}
		const body = readFileSync(resolve(fixtureDir, entry.body_file), 'utf8');
		const payload = ContractPayload.parse({
			kind: 'ContractNode',
			body,
			anchor: { file: entry.contract_path },
			contract_path: entry.contract_path,
			patterns: entry.patterns,
			enforcing_sections: entry.enforcing_sections,
		});
		const seed = dao.seed({
			payload,
			provenance: { source: 'cli', actor: 'drift-harness', detail: { fixture: name } },
		});
		seededByName.set(name, seed.id);
		fixtures.contracts.push({ id: seed.id, payload });
		return seed.id;
	}

	function cleanup(): void {
		try { dbHandle.close(); } catch { /* best-effort */ }
		tmp.dispose();
	}

	return {
		tmp,
		dbHandle,
		dao,
		metrics,
		fixtures,
		asOfMs: opts.asOfMs ?? Date.now(),
		sessionPriority: opts.sessionPriority,
		seedContractFixture,
		cleanup,
	};
}
