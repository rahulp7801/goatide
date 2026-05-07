/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/orchestrator/filter-integration.spec.ts — Phase 5 Plan 05-05.
//
// Ensures submitRawObservation invokes the real 6-gate filter (not the always-accept stub
// from Plan 05-03) and routes rejected observations through appendRejection without
// touching dao.seed or the Plan-05-06 promoter callback. PORT-02 silent-rejection is
// pinned structurally via the negative assertions.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { submitRawObservation, type HarvesterDeps } from '../../../harvester/index.js';
import type { RawObservation } from '../../../harvester/observations.js';

let scratch: string;

beforeEach(() => {
	scratch = mkdtempSync(join(tmpdir(), 'goatide-orch-'));
});

afterEach(() => {
	if (scratch && existsSync(scratch)) {
		rmSync(scratch, { recursive: true, force: true });
	}
});

describe('Plan 05-05: submitRawObservation integrates real Portability Filter', () => {
	it('credential-leak observation rejects + writes rejected-log entry + skips promoter', async () => {
		const path = join(scratch, 'rejected.jsonl');
		const promoter = vi.fn(async () => undefined);
		const liveness = { record: vi.fn() };
		const deps: HarvesterDeps = {
			enrichGit: vi.fn(),
			promoter,
			liveness,
			workspaceFolders: ['/home/dev/proj'],
			rejectedLogPath: path,
			dao: {
				queryByAnchor: vi.fn().mockReturnValue([]),
				seed: vi.fn(),
			} as never,
		};

		const obs: RawObservation = {
			id: 'cred-1', ts: '2026-05-07T12:00:00.000Z',
			body: 'Bug repro: passing sk-ant-api03-fake-secret-here for tests',
			source: 'claude_jsonl',
			file_path: '/home/dev/proj/src/x.ts',
		};

		const result = await submitRawObservation(obs, deps);
		const logged = readFileSync(path, 'utf8').trim().split('\n').map((l) => JSON.parse(l));

		expect({
			result,
			promoterCalls: promoter.mock.calls.length,
			// Plan 05-07: liveness records BEFORE the filter cascade so even rejected
			// observations advance the per-source watchdog (the watcher IS alive — only
			// its content failed the cascade). PORT-02 silent rejection still holds for
			// the promoter side.
			livenessCalls: liveness.record.mock.calls.length,
			loggedCount: logged.length,
			loggedPredicate: logged[0].predicate,
			loggedObservationId: logged[0].observation_id,
		}).toEqual({
			result: { id: 'cred-1', accepted: false, reject_reason: 'credential_scrub' },
			promoterCalls: 0,
			livenessCalls: 1,
			loggedCount: 1,
			loggedPredicate: 'credential_scrub',
			loggedObservationId: 'cred-1',
		});
	});

	it('clean observation passes filter, fires promoter + liveness, no rejected-log entry', async () => {
		const path = join(scratch, 'rejected.jsonl');
		const promoter = vi.fn(async () => undefined);
		const liveness = { record: vi.fn() };
		const deps: HarvesterDeps = {
			enrichGit: vi.fn(),
			promoter,
			liveness,
			workspaceFolders: ['/home/dev/proj'],
			rejectedLogPath: path,
			dao: {
				queryByAnchor: vi.fn().mockReturnValue([]),
				seed: vi.fn(),
			} as never,
		};

		const obs: RawObservation = {
			id: 'clean-1', ts: '2026-05-07T12:00:00.000Z',
			body: 'Discount must use BigDecimal arithmetic to avoid float precision drift in cart subtotal.',
			source: 'claude_jsonl',
			file_path: '/home/dev/proj/src/x.ts',
		};

		const result = await submitRawObservation(obs, deps);

		expect({
			result,
			promoterCalls: promoter.mock.calls.length,
			livenessCalls: liveness.record.mock.calls.length,
			logExists: existsSync(path),
		}).toEqual({
			result: { id: 'clean-1', accepted: true },
			promoterCalls: 1,
			livenessCalls: 1,
			logExists: false,
		});
	});
});
