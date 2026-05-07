/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/integration/_setup.ts — Phase 5 Plan 05-08 phase-verify substrate.
//
// Reusable helpers for the 5 ROADMAP-SC integration specs. Each spec walks the same
// internal code path the production kernel exercises, but with deterministic LLM
// fixture-replay (GOATIDE_LLM_FIXTURE_DIR semantics implemented inline via stageFixture).
// Spawning a detached kernel for every SC would slow the suite > 30s; SC #1 already pins
// the detach pattern via ide-close-survival.spec.ts — the remaining SCs share an
// in-process daemon harness.

import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { openDatabase, GraphDAO, type OpenDatabaseHandle } from '../../../graph/index.js';
import { ReceiptDAO } from '../../../receipt/index.js';
import { OffsetsDao } from '../../../harvester/offsets.js';
import { LivenessState } from '../../../harvester/liveness.js';
import { HarvestMetricsDao } from '../../../harvester/metrics.js';
import { incrementCorroborationAndMaybePromote } from '../../../harvester/promotion-gate/index.js';
import {
	canonicalizeObservation,
	type FixtureMessageResponse,
} from '../../../harvester/promoter/fixtures-replay.js';
import { fixtureLookup } from '../../../harvester/promoter/fixtures-replay.js';
import type { RawObservation } from '../../../harvester/observations.js';
import { submitRawObservation, type HarvesterDeps } from '../../../harvester/index.js';
import type { PromoterContext } from '../../../harvester/promoter/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const PROMOTER_FIXTURE_DIR = resolve(here, '..', 'promoter', 'fixtures');

export interface IntegrationHarness {
	scratch: string;
	fixtureDir: string;
	dbHandle: OpenDatabaseHandle;
	dao: GraphDAO;
	receiptDao: ReceiptDAO;
	deps: HarvesterDeps;
	livenessState: LivenessState;
	metrics: HarvestMetricsDao;
	dispose(): void;
}

/**
 * Build an in-process daemon-equivalent test harness. Spins up a fresh SQLite, a fresh
 * scratch fixture dir, wires HarvesterDeps with the real filter cascade + a fixture-replay
 * Promoter context. The clock is injectable; SC tests advance it to drive liveness staleness.
 */
export function makeHarness(opts?: {
	now?: () => number;
	workspaceFolders?: readonly string[];
}): IntegrationHarness {
	const scratch = mkdtempSync(join(tmpdir(), 'goatide-sc-'));
	const fixtureDir = join(scratch, 'fixtures');
	mkdirSync(fixtureDir, { recursive: true });
	const dbPath = join(scratch, 'graph.db');
	const dbHandle = openDatabase(dbPath);
	const dao = new GraphDAO(dbHandle.db);
	const receiptDao = new ReceiptDAO(dbHandle.db);
	new OffsetsDao(dbHandle.sqlite); // ensure prepared statements compile against schema
	const livenessState = new LivenessState(opts?.now);
	const metrics = new HarvestMetricsDao(dbHandle.sqlite);

	const promoterCtx: PromoterContext = {
		fixtureDir,
		resolveApiKey: async () => 'unused-in-fixture-mode',
		// sdkCall is never invoked in fixture mode; tests fail loudly if it is.
		sdkCall: async () => {
			throw new Error('SC integration test attempted live SDK call — fixture missing for observation');
		},
		model: 'claude-3-5-sonnet-20241022',
	};

	const deps: HarvesterDeps = {
		enrichGit: async () => ({}),
		dao,
		workspaceFolders: opts?.workspaceFolders ?? [],
		livenessState,
		metrics,
		now: opts?.now,
		onCorroborationCandidate: async (existingNodeId, observationSource) => {
			await incrementCorroborationAndMaybePromote({
				dao,
				nodeId: existingNodeId,
				observationProvenanceSource: `harvester:${observationSource}`,
			});
		},
		promoterCtx,
		rejectedLogPath: join(scratch, 'rejected_observations.jsonl'),
	};

	return {
		scratch,
		fixtureDir,
		dbHandle,
		dao,
		receiptDao,
		deps,
		livenessState,
		metrics,
		dispose() {
			try { dbHandle.close(); } catch { /* best-effort */ }
			try { rmSync(scratch, { recursive: true, force: true }); } catch { /* best-effort */ }
		},
	};
}

/**
 * Stage a Plan 05-06 fixture under the content-addressed hash key for the given observation.
 * Mirrors stageFixtureForObservation in promoter.spec.ts but writes into the harness's
 * scratch fixture dir. Returns the staged path for assertion.
 */
export function stageFixture(harness: IntegrationHarness, fixtureName: string, obs: RawObservation): string {
	const hash = createHash('sha256').update(canonicalizeObservation(obs)).digest('hex');
	const stagedPath = join(harness.fixtureDir, `${hash}.json`);
	const sourcePath = join(PROMOTER_FIXTURE_DIR, fixtureName);
	writeFileSync(stagedPath, readFileSync(sourcePath, 'utf8'));
	return stagedPath;
}

/**
 * Submit a RawObservation through the in-process orchestrator (the same code path the
 * production daemon's harvester.submitObservation RPC handler invokes). Asserts deterministic
 * orchestration without spawning a subprocess.
 */
export async function submit(
	harness: IntegrationHarness,
	obs: RawObservation,
): Promise<{ id: string; accepted: boolean; reject_reason?: string }> {
	return submitRawObservation(obs, harness.deps);
}

/**
 * Return the most recent active node whose anchor.file matches the given path. Helper for
 * SC #1 + SC #5 integration assertions.
 */
export function findActiveNodeByAnchor(
	harness: IntegrationHarness,
	anchorFile: string,
): { id: string; payload: unknown; confidence: string; provenanceSource: string } | null {
	const rows = harness.dao.queryByAnchor(
		{ jsonPath: '$.anchor.file', value: anchorFile },
		new Date().toISOString(),
	);
	if (rows.length === 0) {
		return null;
	}
	const newest = rows.reduce((acc, r) => (r.recorded_at > acc.recorded_at ? r : acc));
	const provRow = harness.dao.queryProvenance(newest.id);
	return {
		id: newest.id,
		payload: newest.payload,
		confidence: newest.confidence,
		provenanceSource: provRow?.source ?? '',
	};
}

/**
 * Walk the supersedes chain from a node id forward, returning the head (most recent active
 * node). Helper for SC #5 corroboration-path assertion.
 */
export function followToHead(
	harness: IntegrationHarness,
	startId: string,
): { id: string; payload: unknown; confidence: string } {
	let cursor = startId;
	for (;;) {
		const next = harness.dao.findSuccessor(cursor);
		if (!next) {
			break;
		}
		cursor = next.id;
	}
	const head = harness.dao.queryById(cursor);
	if (!head) {
		throw new Error(`followToHead: no head row found for ${startId}`);
	}
	return { id: head.id, payload: head.payload, confidence: head.confidence };
}

/**
 * Count supersedes edges with the given dst (i.e., how many times this original was
 * superseded). Helper for SC #5 audit-trail assertion.
 */
export function countSupersedesChain(harness: IntegrationHarness, originalId: string): number {
	let count = 0;
	let cursor: string | null = originalId;
	while (cursor) {
		const next = harness.dao.findSuccessor(cursor);
		if (!next) {
			break;
		}
		count++;
		cursor = next.id;
	}
	return count;
}

/**
 * Verify that the staged fixture lookup resolves to a parsed FixtureMessageResponse.
 * Used by SC tests to fail fast if a staging step is broken.
 */
export function assertFixtureStaged(
	harness: IntegrationHarness,
	obs: RawObservation,
): FixtureMessageResponse {
	const fixture = fixtureLookup(obs, harness.fixtureDir);
	if (!fixture) {
		throw new Error(`Fixture not staged for observation ${obs.id} in ${harness.fixtureDir}`);
	}
	return fixture;
}

/** Convenience: assert a path exists. */
export function exists(p: string): boolean {
	return existsSync(p);
}
