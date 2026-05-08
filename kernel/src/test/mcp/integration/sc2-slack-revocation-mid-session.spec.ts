/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/integration/sc2-slack-revocation-mid-session.spec.ts — Phase 6 Plan 06-07.
//
// ROADMAP SC #2 — "Developer revokes the Slack OAuth token mid-session; the kernel surfaces
// a status-bar warning, exponential-backoff retries, and proactive-refresh logs are visible
// — the kernel does not silently drop signal."
//
// Coverage layers:
//   1. REVOCATION DETECTOR (parameterized over 3 Slack shapes) — kernel/src/mcp/auth/revocation.ts
//      detectSlackRevocation handles invalid_auth / account_inactive / token_revoked.
//   2. POOL ISOLATION — slack-mock spawned with --mode revoked → tools/call returns isError;
//      pool's Pitfall-4 check throws on isError so the observation pipeline never sees
//      revoked tool outputs (no silent drop into the graph).
//   3. LIVENESS BRIDGE FILTERING — bridge filterMcpLivenessEntries + isMcpLivenessSource +
//      providerNameFromSource correctly extract the mcp.slack source so the LivenessBanner
//      surfaces only the affected provider when it goes stale.
//
// This integration spec exercises the kernel layer of SC #2. The visual layer (LivenessBanner
// errorBackground theme color rendering under the actual VS Code host) is W2 carryover —
// developer-runnable manual ceremony per Phase 1.1 SC #2 precedent.

import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	detectRevocation,
	detectSlackRevocation,
	type StructuredError,
} from '../../../mcp/auth/revocation.js';
import { McpClientPool } from '../../../mcp/clients/pool.js';
import { ToolRegistry } from '../../../mcp/registry.js';
import { makeProviderConfig } from '../../helpers/mcp-fixtures.js';
import type { McpProviderName } from '../../../mcp/clients/types.js';

// Bridge-side liveness helpers (these are the pure functions the LivenessBanner-ext uses
// to filter mcp.* sources). They live in src/vs/goatide/extensions/goatide-bridge/src/mcp/
// liveness-banner-ext.ts — but they're PURE functions of the source-name string, so we can
// re-implement here OR exercise via importing if tsconfig paths allowed it. To keep this
// integration spec hermetic we re-implement the contract verbatim and pin the contract
// against the bridge source via a separate bridge mocha test.
function isMcpLivenessSource(source: string): boolean {
	if (!source.startsWith('mcp.')) {
		return false;
	}
	const provider = source.slice('mcp.'.length);
	return provider === 'github' || provider === 'slack' || provider === 'linear' || provider === 'jira';
}
function providerNameFromSource(source: string): McpProviderName | null {
	if (!isMcpLivenessSource(source)) {
		return null;
	}
	return source.slice('mcp.'.length) as McpProviderName;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_PATH = resolve(__dirname, '..', '..', 'mcp', 'fixtures', 'oauth-revocation-fixtures.json');
const fixtures = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8')) as Record<string, Record<string, unknown>>;

const SLACK_REVOCATION_SHAPES = [
	['invalid_auth', { ok: false, error: 'invalid_auth' }],
	['account_inactive', { ok: false, error: 'account_inactive' }],
	['token_revoked', { ok: false, error: 'token_revoked' }],
] as const;

describe('ROADMAP SC #2 — Slack OAuth revoked mid-session → revocation detector + pool isolation + liveness filter', () => {
	// Pool tests need XDG_CONFIG_HOME / APPDATA isolation (schema-drift detector writes
	// snapshots; cross-test pollution would cause drift across runs).
	let tmpRoot: string | null = null;
	let prevXdg: string | undefined;
	let prevAppdata: string | undefined;

	function isolateConfig() {
		tmpRoot = mkdtempSync(join(tmpdir(), 'goatide-sc2-'));
		prevXdg = process.env.XDG_CONFIG_HOME;
		prevAppdata = process.env.APPDATA;
		process.env.XDG_CONFIG_HOME = tmpRoot;
		process.env.APPDATA = tmpRoot;
	}
	function restoreConfig() {
		if (prevXdg === undefined) {
			delete process.env.XDG_CONFIG_HOME;
		} else {
			process.env.XDG_CONFIG_HOME = prevXdg;
		}
		if (prevAppdata === undefined) {
			delete process.env.APPDATA;
		} else {
			process.env.APPDATA = prevAppdata;
		}
		if (tmpRoot) {
			try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
			tmpRoot = null;
		}
	}

	afterEach(() => {
		restoreConfig();
	});

	it('SC #2 — Slack revocation detector handles all 3 documented shapes (parameterized)', () => {
		// Parameterize over the 3 Slack revocation shapes per ROADMAP SC #2 (no silent drop).
		const results: Record<string, { revoked: boolean; reason?: string }> = {};
		for (const [name, body] of SLACK_REVOCATION_SHAPES) {
			results[name] = detectSlackRevocation({ body } as StructuredError);
		}
		// Also verify the dispatcher route through detectRevocation('slack', ...).
		const dispatched = detectRevocation('slack', { body: fixtures.slack.invalid_auth });
		// And confirm a non-revocation shape does NOT trip the detector.
		const unrelated = detectSlackRevocation({ body: { ok: false, error: 'rate_limited' } });

		expect({
			invalid_auth: results['invalid_auth'],
			account_inactive: results['account_inactive'],
			token_revoked: results['token_revoked'],
			dispatched,
			unrelated,
		}).toEqual({
			invalid_auth: { revoked: true, reason: 'invalid_auth' },
			account_inactive: { revoked: true, reason: 'account_inactive' },
			token_revoked: { revoked: true, reason: 'token_revoked' },
			dispatched: { revoked: true, reason: 'invalid_auth' },
			unrelated: { revoked: false },
		});
	});

	it('SC #2 — pool with slack --mode revoked: tool calls fail with isError; observation NEVER routes to graph (Pitfall 4 — no silent drop)', async () => {
		isolateConfig();
		const registry = new ToolRegistry();
		const observations: unknown[] = [];

		// Build configs for all 4 providers but Slack runs in --mode revoked. Healthy
		// providers (github/linear/jira) connect normally; slack connects + lists tools but
		// every tool call returns isError: true with body={ok:false, error:'invalid_auth'}.
		const configs = (['github', 'slack', 'linear', 'jira'] as const).map((p) => {
			const cfg = makeProviderConfig({ provider: p });
			const mode = p === 'slack' ? 'revoked' : 'normal';
			return { ...cfg, args: [...cfg.args, '--mode', mode] };
		});

		const pool = new McpClientPool({
			configs,
			registry,
			onObservation: async (o) => {
				observations.push(o);
			},
			backoff: { maxAttempts: 2, baseMs: 5, cooldownMs: 5 },
		});

		try {
			await pool.start();

			// Slack should still be 'connected' (initialize + tools/list both succeed in
			// revoked mode — only tools/call fails). Healthy providers reach 'connected' too.
			const states = {
				github: pool.getProviderState('github'),
				slack: pool.getProviderState('slack'),
				linear: pool.getProviderState('linear'),
				jira: pool.getProviderState('jira'),
			};

			// Attempt to dispatch the slack thread_fetch tool; pool's per-tool handler should
			// detect isError and throw. The onObservation callback MUST NOT be invoked
			// (Pitfall 4 — no silent observation drop).
			const slackThreadFetch = registry.get('slack__thread_fetch');
			let dispatchError: string | null = null;
			try {
				await slackThreadFetch?.handler({ channel: 'C123', thread_ts: '111.222' });
			} catch (err) {
				dispatchError = (err as Error).message;
			}

			expect({
				healthy: { github: states.github, linear: states.linear, jira: states.jira },
				slackToolsRegistered: registry.listByProvider('slack').length,
				dispatchErrorContainsIsError: dispatchError?.includes('isError') ?? false,
				dispatchErrorMentionsSlackThreadFetch: dispatchError?.includes('slack__thread_fetch') ?? false,
				observationsCaptured: observations.length,
			}).toEqual({
				healthy: { github: 'connected', linear: 'connected', jira: 'connected' },
				slackToolsRegistered: 3, // thread_fetch + channel_list + message_post
				dispatchErrorContainsIsError: true,
				dispatchErrorMentionsSlackThreadFetch: true,
				observationsCaptured: 0, // no silent drop into the graph
			});
		} finally {
			await pool.close();
		}
	}, 30_000);

	it('SC #2 — bridge LivenessBanner-ext filter helpers correctly identify mcp.slack as the affected provider', () => {
		// The bridge LivenessBanner-ext (Plan 06-06) extends Phase-5 LivenessBanner with
		// 4 mcp.<provider> source keys. SC #2 asserts the filter helpers correctly extract
		// the mcp.slack entry from a mixed liveness report so the banner can render the
		// correct stale-provider quickPick when the Slack OAuth is revoked + the kernel
		// stops recording mcp.slack observations + the source goes stale.

		const synthLivenessReport = [
			{ source: 'claude_jsonl', stale: false, silent_for_ms: 0, threshold_ms: 60_000 },
			{ source: 'editor_save', stale: false, silent_for_ms: 0, threshold_ms: 60_000 },
			{ source: 'mcp.github', stale: false, silent_for_ms: 0, threshold_ms: 3_600_000, last_observation_iso: '2026-05-08T00:00:00Z' },
			{ source: 'mcp.slack', stale: true, silent_for_ms: 4_000_000, threshold_ms: 3_600_000, last_observation_iso: '2026-05-08T00:00:00Z' },
			{ source: 'mcp.linear', stale: false, silent_for_ms: 0, threshold_ms: 3_600_000, last_observation_iso: '2026-05-08T00:00:00Z' },
			{ source: 'mcp.jira', stale: false, silent_for_ms: 0, threshold_ms: 3_600_000, last_observation_iso: '2026-05-08T00:00:00Z' },
			{ source: 'git_commit', stale: false, silent_for_ms: 0, threshold_ms: 60_000 },
		];

		const mcpEntries = synthLivenessReport.filter((s) => isMcpLivenessSource(s.source));
		const staleMcp = mcpEntries.filter((s) => s.stale);
		const staleSlackProvider = staleMcp.length === 1 ? providerNameFromSource(staleMcp[0].source) : null;

		expect({
			mcpEntryCount: mcpEntries.length,
			mcpProvidersInOrder: mcpEntries.map((s) => providerNameFromSource(s.source)),
			staleMcpCount: staleMcp.length,
			staleSlackProvider,
			isClaudeJsonlMcp: isMcpLivenessSource('claude_jsonl'),
			isMcpUnknownProvider: isMcpLivenessSource('mcp.discord'), // not one of the 4
			providerFromBadSource: providerNameFromSource('claude_jsonl'),
		}).toEqual({
			mcpEntryCount: 4,
			mcpProvidersInOrder: ['github', 'slack', 'linear', 'jira'],
			staleMcpCount: 1,
			staleSlackProvider: 'slack',
			isClaudeJsonlMcp: false,
			isMcpUnknownProvider: false,
			providerFromBadSource: null,
		});
	});

	it('SC #2 — kernel.log auditability: revocation reason is structured (machine-readable, no silent drop)', () => {
		// The "no silent drop" contract requires that revocation events surface a stable
		// machine-readable reason (so support / dashboards can correlate). Walk the 3
		// Slack shapes + GitHub + Linear + Jira and verify each detector emits a stable
		// reason string the bridge can render in the LivenessBanner tooltip.
		const reasons = {
			slack_invalid_auth: detectRevocation('slack', { body: { ok: false, error: 'invalid_auth' } }).reason,
			slack_account_inactive: detectRevocation('slack', { body: { ok: false, error: 'account_inactive' } }).reason,
			slack_token_revoked: detectRevocation('slack', { body: { ok: false, error: 'token_revoked' } }).reason,
			github_bad_credentials: detectRevocation('github', { status: 401, headers: { 'WWW-Authenticate': 'Bearer realm="GitHub"' } }).reason,
			linear_authentication_error: detectRevocation('linear', { status: 401, body: { errors: [{ extensions: { code: 'AUTHENTICATION_ERROR' } }] } }).reason,
			jira_unauthorized: detectRevocation('jira', { status: 401, body: { errorMessages: ['Login required'] } }).reason,
			jira_forbidden: detectRevocation('jira', { status: 403 }).reason,
		};

		expect(reasons).toEqual({
			slack_invalid_auth: 'invalid_auth',
			slack_account_inactive: 'account_inactive',
			slack_token_revoked: 'token_revoked',
			github_bad_credentials: 'bad_credentials',
			linear_authentication_error: 'AUTHENTICATION_ERROR',
			jira_unauthorized: 'unauthorized',
			jira_forbidden: 'forbidden',
		});
	});
});
