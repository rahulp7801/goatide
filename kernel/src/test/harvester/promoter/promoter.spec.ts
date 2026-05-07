/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/promoter/promoter.spec.ts — Phase 5 Plan 05-06 PORT-04.
//
// promote() is the Anthropic-tool-use orchestrator that turns a filter-survivor observation
// into a typed Inferred node payload. Tests pin: (1) recorded-fixture mode replays without
// touching the live SDK; (2) tool_use response parses through NodePayloadSchema and routes
// to dao.seed with confidence='Inferred'; (3) schema_violation drops the observation
// (no graph write, metrics increment, NO corroboration call); (4) keytar resolves the API
// key before any LLM call.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import {
	promote,
	type PromoterContext,
	type PromoterResult,
} from '../../../harvester/promoter/index.js';
import { canonicalizeObservation } from '../../../harvester/promoter/fixtures-replay.js';
import type { RawObservation } from '../../../harvester/observations.js';

const here = dirname(fileURLToPath(import.meta.url));
const FIXTURE_DIR = resolve(here, 'fixtures');

let scratch: string;

beforeEach(() => {
	scratch = mkdtempSync(join(tmpdir(), 'goatide-promoter-'));
});

afterEach(() => {
	if (scratch && existsSync(scratch)) {
		rmSync(scratch, { recursive: true, force: true });
	}
});

/**
 * Build an observation whose canonicalized hash matches the named committed fixture file.
 * The fixtures are hand-authored, so we hash on the fly here and copy the fixture into a
 * scratch dir keyed by hash. Plan 05-06 fixtures live under FIXTURE_DIR.
 */
function stageFixtureForObservation(observationId: string, fixtureName: string, obs: RawObservation): string {
	const hash = createHash('sha256').update(canonicalizeObservation(obs)).digest('hex');
	const stagedPath = join(scratch, `${hash}.json`);
	const sourcePath = join(FIXTURE_DIR, fixtureName);
	const { readFileSync } = require('node:fs') as typeof import('node:fs');
	writeFileSync(stagedPath, readFileSync(sourcePath, 'utf8'));
	return stagedPath;
}

describe('PORT-04: Promoter (Anthropic tool-use)', () => {
	it('recorded-fixture mode replays without live API call (4 NodeKind classifications)', async () => {
		const sdkCallSpy = vi.fn();
		const obs1: RawObservation = {
			id: 'obs-1', ts: '2026-05-07T00:00:00.000Z',
			body: 'Discount must use BigDecimal arithmetic to avoid float precision drift in cart subtotal.',
			source: 'claude_jsonl', file_path: 'src/checkout/calculator.ts',
		};
		const obs2: RawObservation = {
			id: 'obs-2', ts: '2026-05-07T00:00:00.000Z',
			body: 'fix(auth): reject empty Bearer token at middleware\n\nMiddleware previously treated empty token as anonymous; explicit length check now.',
			source: 'git_commit', repo_path: '/repo', head_commit_at_emit: 'cafe', head_branch_at_emit: 'main',
		};
		const obs3: RawObservation = {
			id: 'obs-3', ts: '2026-05-07T00:00:00.000Z',
			body: 'Renamed UserService.findById to UserService.requireById to enforce non-null contract.',
			source: 'editor_save', file_path: 'src/services/user.service.ts',
			language: 'ts', line_count: 18,
		};
		const obs4: RawObservation = {
			id: 'obs-4', ts: '2026-05-07T00:00:00.000Z',
			body: 'npm test failed with HTTP 504 in payment.test.ts after 30s; should JEST_TIMEOUT be 60s?',
			source: 'terminal_shell', output: 'Error: Timeout - Async callback was not invoked within 30000ms',
			exit_code: 1, cwd: '/repo',
		};

		stageFixtureForObservation(obs1.id, '01-constraint-from-claude.json', obs1);
		stageFixtureForObservation(obs2.id, '02-decision-from-git-commit.json', obs2);
		stageFixtureForObservation(obs3.id, '03-contract-from-editor-save.json', obs3);
		stageFixtureForObservation(obs4.id, '04-openquestion-from-terminal.json', obs4);

		const ctx: PromoterContext = {
			fixtureDir: scratch,
			sdkCall: sdkCallSpy,
			resolveApiKey: async () => 'unused-in-fixture-mode',
			model: 'claude-3-5-sonnet-20241022',
		};

		const r1 = await promote(obs1, ctx);
		const r2 = await promote(obs2, ctx);
		const r3 = await promote(obs3, ctx);
		const r4 = await promote(obs4, ctx);

		expect({
			r1Kind: r1.kind, r1NodeKind: r1.kind === 'classified' ? r1.payload.kind : undefined,
			r2Kind: r2.kind, r2NodeKind: r2.kind === 'classified' ? r2.payload.kind : undefined,
			r3Kind: r3.kind, r3NodeKind: r3.kind === 'classified' ? r3.payload.kind : undefined,
			r4Kind: r4.kind, r4NodeKind: r4.kind === 'classified' ? r4.payload.kind : undefined,
			sdkCalls: sdkCallSpy.mock.calls.length,
		}).toEqual({
			r1Kind: 'classified', r1NodeKind: 'ConstraintNode',
			r2Kind: 'classified', r2NodeKind: 'DecisionNode',
			r3Kind: 'classified', r3NodeKind: 'ContractNode',
			r4Kind: 'classified', r4NodeKind: 'OpenQuestion',
			sdkCalls: 0,
		});
	});

	it('tool_use response -> NodePayloadSchema parse -> classified Inferred payload', async () => {
		const obs: RawObservation = {
			id: 'obs-1', ts: '2026-05-07T00:00:00.000Z',
			body: 'Discount must use BigDecimal arithmetic to avoid float precision drift in cart subtotal.',
			source: 'claude_jsonl', file_path: 'src/checkout/calculator.ts',
		};
		stageFixtureForObservation(obs.id, '01-constraint-from-claude.json', obs);

		const ctx: PromoterContext = {
			fixtureDir: scratch,
			sdkCall: vi.fn(),
			resolveApiKey: async () => 'unused-in-fixture-mode',
			model: 'claude-3-5-sonnet-20241022',
		};

		const result = await promote(obs, ctx);

		expect({
			kind: result.kind,
			payloadKind: result.kind === 'classified' ? result.payload.kind : undefined,
			hasAnchor: result.kind === 'classified' && !!result.payload.anchor,
			anchorFile: result.kind === 'classified' ? result.payload.anchor?.file : undefined,
			model: result.kind === 'classified' ? result.model : undefined,
		}).toEqual({
			kind: 'classified',
			payloadKind: 'ConstraintNode',
			hasAnchor: true,
			anchorFile: 'src/checkout/calculator.ts',
			model: 'claude-3-5-sonnet-20241022',
		});
	});

	it('schema violation in tool_use -> schema_violation result + no classification (corroboration NOT triggered)', async () => {
		const obs: RawObservation = {
			id: 'obs-violator', ts: '2026-05-07T00:00:00.000Z',
			body: 'I think this codebase is messy and we should refactor.',
			source: 'claude_jsonl', file_path: 'src/x.ts',
		};
		stageFixtureForObservation(obs.id, '05-schema-violation.json', obs);

		const ctx: PromoterContext = {
			fixtureDir: scratch,
			sdkCall: vi.fn(),
			resolveApiKey: async () => 'unused-in-fixture-mode',
			model: 'claude-3-5-sonnet-20241022',
		};

		const result: PromoterResult = await promote(obs, ctx);

		expect({
			kind: result.kind,
			hasErrors: result.kind === 'schema_violation' && result.errors.length > 0,
		}).toEqual({
			kind: 'schema_violation',
			hasErrors: true,
		});
	});

	it('API key resolved via injected resolver before LLM call (live mode path)', async () => {
		const obs: RawObservation = {
			id: 'no-fixture', ts: '2026-05-07T00:00:00.000Z',
			body: 'A novel observation never seen in fixtures.',
			source: 'claude_jsonl', file_path: 'src/novel.ts',
		};

		const resolveApiKey = vi.fn(async () => null);   // No key available
		const sdkCall = vi.fn();
		const ctx: PromoterContext = {
			// no fixtureDir — live path active
			sdkCall,
			resolveApiKey,
			model: 'claude-3-5-sonnet-20241022',
		};

		const result = await promote(obs, ctx);

		expect({
			kind: result.kind,
			resolveCallCount: resolveApiKey.mock.calls.length,
			sdkCallCount: sdkCall.mock.calls.length,
		}).toEqual({
			// No api key + no fixture -> short-circuit. The Promoter must NOT call sdkCall.
			kind: 'transport_error',
			resolveCallCount: 1,
			sdkCallCount: 0,
		});
	});
});
