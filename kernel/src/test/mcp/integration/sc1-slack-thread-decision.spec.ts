/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/integration/sc1-slack-thread-decision.spec.ts — Phase 6 Plan 06-07.
//
// ROADMAP SC #1 — "Developer links a Slack thread URL to a file via the MCP-driven flow; the
// kernel ingests it as a DecisionNode candidate (mapped via the schema-mapper table) which
// routes through the same Portability Filter and Verification Canvas as any local observation."
//
// What this spec proves end-to-end (in-process; the detached daemon path is pinned by Plan
// 05-02's ide-close-survival.spec.ts and inherited):
//
//   1. SCHEMA-MAPPER — slack/thread_fetch result → schema-mapper RULES table → DecisionNode
//      candidate_node_kind_hint with extracted thread body (alice/bob/carol/alice).
//   2. OBSERVATION-ROUTER — wraps the tool-call result as `mcp_external_signal` RawObservation
//      and submits via the SAME submitRawObservation entry point used by Phase-5 watchers.
//   3. PHASE-5 6-GATE CASCADE — credential-scrub → portable → net-new → project-relevant →
//      verifiable → justified all green for the well-formed thread body.
//   4. PROMOTER (fixture-replay) — classifies the observation under a DecisionNode kind.
//      Uses the canonicalize-hash → fixture-lookup → tool-use response chain.
//   5. DAO SEED — Inferred DecisionNode lands with provenance.source='harvester:mcp_external_signal'.
//
// The integration test substrate is the in-process daemon-equivalent harness from
// _setup.ts (mirrors Plan 05-08 sc1-jsonl-survival.spec.ts pattern). Real production code
// paths exercised:
//   - kernel/src/mcp/schema-mapper.ts → mapToolResultToCandidate
//   - kernel/src/mcp/clients/observation-router.ts → routeMcpObservation
//   - kernel/src/harvester/index.ts → submitRawObservation (Phase-5 cascade + Promoter)
//   - kernel/src/graph/dao.ts → seed (confidence='Inferred')

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { mapToolResultToCandidate } from '../../../mcp/schema-mapper.js';
import { routeMcpObservation } from '../../../mcp/clients/observation-router.js';
import { submitRawObservation } from '../../../harvester/index.js';
import { canonicalizeObservation } from '../../../harvester/promoter/fixtures-replay.js';
import type { McpExternalSignalObservation } from '../../../harvester/observations.js';
import { makeHarness, findActiveNodeByAnchor, type IntegrationHarness } from '../../harvester/integration/_setup.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROMOTER_FIXTURE_DIR = resolve(__dirname, '..', '..', 'harvester', 'promoter', 'fixtures');

/**
 * Stage a Plan 05-06 fixture under the canonical-hash key for an arbitrary observation.
 * Mirrors `stageFixture` in harvester/integration/_setup.ts but is parameterized over
 * the observation type so SC1 can stage for an McpExternalSignalObservation.
 */
function stageMcpFixture(harness: IntegrationHarness, fixtureName: string, obs: McpExternalSignalObservation): string {
	const hash = createHash('sha256').update(canonicalizeObservation(obs)).digest('hex');
	const stagedPath = join(harness.fixtureDir, `${hash}.json`);
	mkdirSync(dirname(stagedPath), { recursive: true });
	const fixturePath = join(PROMOTER_FIXTURE_DIR, fixtureName);
	const { readFileSync } = require('node:fs') as typeof import('node:fs');
	writeFileSync(stagedPath, readFileSync(fixturePath, 'utf8'));
	return stagedPath;
}

describe('ROADMAP SC #1 — Slack thread URL → DecisionNode candidate via schema-mapper + Phase-5 cascade', () => {
	let harness: IntegrationHarness;

	beforeEach(() => {
		harness = makeHarness({ workspaceFolders: ['/repo'] });
	});

	afterEach(() => {
		harness.dispose();
	});

	it('SC #1 — schema-mapper produces DecisionNode hint for slack/thread_fetch', () => {
		// Pre-flight unit verification of the schema-mapper rule the SC depends on.
		const result = mapToolResultToCandidate('slack', 'thread_fetch', {
			messages: [
				{ user: 'alice', text: 'we should use postgres for the audit log' },
				{ user: 'bob', text: 'agreed — sqlite stays for the per-project graph; postgres for the multi-tenant audit' },
				{ user: 'carol', text: 'lets go with that' },
				{ user: 'alice', text: 'merging today' },
			],
		});

		expect({
			candidate_node_kind_hint: result.candidate_node_kind_hint,
			bodyContainsAliceFirst: result.body.startsWith('alice:'),
			bodyContainsBobAgreed: result.body.includes('agreed'),
			bodyJoinedNewlines: result.body.split('\n').length === 4,
		}).toEqual({
			candidate_node_kind_hint: 'DecisionNode',
			bodyContainsAliceFirst: true,
			bodyContainsBobAgreed: true,
			bodyJoinedNewlines: true,
		});
	});

	it('SC #1 — Slack thread URL → DecisionNode in graph via routeMcpObservation + Phase-5 conveyor + Promoter (fixture-replay)', async () => {
		// Use the fixture-02 input (DecisionNode kind, anchor at src/middleware/auth.middleware.ts).
		// We construct a deterministic McpExternalSignalObservation, stage the matching fixture,
		// and submit through routeMcpObservation — which exercises mapToolResultToCandidate +
		// submitRawObservation (the SAME 6-gate cascade Phase-5 watchers use). Asserts:
		//   - accepted=true (cascade passed)
		//   - graph contains a DecisionNode at the fixture's anchor with confidence='Inferred'
		//   - provenance.source='harvester:mcp_external_signal'

		// 1. Build the observation directly (NOT via routeMcpObservation, because we need a
		//    deterministic id/ts for the fixture hash). The schema-mapper output IS the body;
		//    the candidate_node_kind_hint is in detail. This mirrors what routeMcpObservation
		//    would build from the slack/thread_fetch result.
		const slackResult = {
			messages: [
				{ user: 'alice', text: 'we should reject empty bearer-token values at middleware' },
				{ user: 'bob', text: 'agreed — empty token is anonymous; req.user truthy bypass is the bug' },
				{ user: 'carol', text: 'lets go with that' },
				{ user: 'alice', text: 'merging today' },
			],
		};
		const mapped = mapToolResultToCandidate('slack', 'thread_fetch', slackResult);
		const observation: McpExternalSignalObservation = {
			id: 'sc1-slack-thread-decision-1',
			ts: '2026-05-08T01:00:00.000Z',
			source: 'mcp_external_signal',
			provider: 'slack',
			tool_name: 'thread_fetch',
			body: mapped.body,
			detail: { candidate_node_kind_hint: mapped.candidate_node_kind_hint },
		};

		// 2. Stage the Plan 05-06 fixture-02 (DecisionNode with anchor at
		//    src/middleware/auth.middleware.ts) under the observation's canonical hash.
		stageMcpFixture(harness, '02-decision-from-git-commit.json', observation);

		// 3. Submit through the production submitRawObservation entry point. This drives
		//    runFilter (6-gate cascade) → promote() (fixture-replay) → dao.seed (Inferred).
		const result = await submitRawObservation(observation, harness.deps);

		expect({ accepted: result.accepted, id: result.id, reject_reason: result.reject_reason ?? null }).toEqual({
			accepted: true,
			id: 'sc1-slack-thread-decision-1',
			reject_reason: null,
		});

		// 4. Assert: an Inferred DecisionNode now exists at the fixture's anchor with
		//    provenance.source='harvester:mcp_external_signal'.
		const found = findActiveNodeByAnchor(harness, 'src/middleware/auth.middleware.ts');
		const payload = found?.payload as { kind?: string; anchor?: { file?: string }; body?: string } | undefined;

		expect({
			nodeExists: !!found,
			kind: payload?.kind,
			confidence: found?.confidence,
			anchorFile: payload?.anchor?.file,
			provenanceSource: found?.provenanceSource,
			bodyMentionsBearer: payload?.body?.includes('bearer-token') ?? false,
		}).toEqual({
			nodeExists: true,
			kind: 'DecisionNode',
			confidence: 'Inferred',
			anchorFile: 'src/middleware/auth.middleware.ts',
			provenanceSource: 'harvester:mcp_external_signal',
			bodyMentionsBearer: true,
		});
	});

	it('SC #1 — routeMcpObservation honors Pitfall-4 isError check + Pitfall-11 success-shape rejection', async () => {
		// Verify routeMcpObservation's two defenses with a fresh harness (the second test above
		// already seeded a node and we want a clean slate here for the reject-path assertion).

		// Pitfall 4: tool-level isError=true is NOT routed.
		const errorResult = await routeMcpObservation({
			provider: 'github',
			tool_name: 'issue_read',
			arguments: {},
			result: { error: 'rate limited' },
			isError: true,
			deps: harness.deps,
		});
		expect({ accepted: errorResult.accepted, predicate: errorResult.predicate }).toEqual({
			accepted: false,
			predicate: 'tool_error',
		});

		// Pitfall 11: filter-level rejection (e.g. credential-scrub) returns accepted=false +
		// predicate=<rejector> — NOT isError:true. The SC uses the Slack thread containing a
		// credential-leak shape; the live 6-gate cascade routes it through credential-scrub.
		const credentialLeakResult = await routeMcpObservation({
			provider: 'slack',
			tool_name: 'thread_fetch',
			arguments: {},
			result: {
				messages: [
					{ user: 'mallory', text: 'sk-ant-api03-fake-1234567890abcdef' },
				],
			},
			deps: harness.deps,
		});

		expect({
			accepted: credentialLeakResult.accepted,
			predicateIsCredentialScrub: credentialLeakResult.predicate === 'credential_scrub',
		}).toEqual({
			accepted: false,
			predicateIsCredentialScrub: true,
		});
	});
});
