/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/integration/sc3-schema-drift-pause.spec.ts — Phase 6 Plan 06-07.
//
// ROADMAP SC #3 — "A provider's tool schema changes between sessions and the kernel's
// schema-drift snapshot detects it, pausing the integration and surfacing a Canvas alert
// (no silent rewrite)."
//
// What this spec proves end-to-end:
//
//   1. SCHEMA-DRIFT DETECTOR — first-connect with slack-before tools writes baseline +
//      returns changed=false (Pitfall 5). Subsequent connect with slack-after tools (added
//      `cursor` input param on thread_fetch) returns changed=true with per-tool hash diff.
//   2. POOL paused_drift TRANSITION — McpClientPool's connect path calls snapshotAndDetectDrift;
//      on changed=true, state transitions to 'paused_drift' AND tool registration is SKIPPED
//      (no silent rewrite — the operator must explicitly accept the new schema).
//   3. SCHEMA-DRIFT REPORT — pool.getSchemaDriftReport returns paused=true + drift_summary
//      for the affected provider. This is the bridge SchemaDriftBanner's data source.
//   4. ACCEPT FLOW — pool.acceptProviderSchemaDrift (with a wired accept-callback) returns
//      true; subsequent reconnect re-baselines + tools register cleanly.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

import { McpClientPool } from '../../../mcp/clients/pool.js';
import { ToolRegistry } from '../../../mcp/registry.js';
import { snapshotAndDetectDrift, acceptProviderSchemaDrift } from '../../../mcp/schema-drift/detector.js';
import { writeSnapshot, readSnapshot, canonicalHash, type ProviderSnapshot } from '../../../mcp/schema-drift/snapshot.js';
import { resolveSchemaSnapshotPath } from '../../../mcp/schema-drift/paths.js';
import { makeProviderConfig } from '../../helpers/mcp-fixtures.js';
import type { StdioClientHandle } from '../../../mcp/clients/stdio-client.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const fixturesDir = resolve(__dirname, '..', '..', 'mcp', 'fixtures', 'schema-drift-fixtures');
const slackBefore = JSON.parse(readFileSync(resolve(fixturesDir, 'slack-before.json'), 'utf8')) as {
	tools: Array<{ name: string; raw_schema: { input: unknown; output: unknown } }>;
};
const slackAfter = JSON.parse(readFileSync(resolve(fixturesDir, 'slack-after.json'), 'utf8')) as {
	tools: Array<{ name: string; raw_schema: { input: unknown; output: unknown } }>;
};

function makeFakeClient(toolsFromFixture: typeof slackBefore.tools): Client {
	return {
		listTools: async () => ({
			tools: toolsFromFixture.map((t) => ({
				name: t.name,
				inputSchema: t.raw_schema.input,
				outputSchema: t.raw_schema.output,
			})),
		}),
		callTool: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
		close: async () => undefined,
	} as unknown as Client;
}

function makeFakeStdioFactory(toolsFromFixture: typeof slackBefore.tools) {
	return async (_args: { onError: (err: Error) => void; onClose?: () => void }): Promise<StdioClientHandle> => {
		const client = makeFakeClient(toolsFromFixture);
		return { client, transport: {} as never };
	};
}

describe('ROADMAP SC #3 — Schema drift detected → paused_drift + Canvas alert + Accept flow', () => {
	let tmpRoot: string;
	let prevXdg: string | undefined;
	let prevAppdata: string | undefined;

	beforeEach(() => {
		tmpRoot = mkdtempSync(join(tmpdir(), 'goatide-sc3-'));
		prevXdg = process.env.XDG_CONFIG_HOME;
		prevAppdata = process.env.APPDATA;
		process.env.XDG_CONFIG_HOME = tmpRoot;
		process.env.APPDATA = tmpRoot;
	});

	afterEach(() => {
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
		try { rmSync(tmpRoot, { recursive: true, force: true }); } catch { /* best-effort */ }
	});

	it('SC #3 — drift detector: identical schema → changed=false; modified schema → changed=true with per-tool hash diff', async () => {
		// First-connect writes baseline + returns changed=false (Pitfall 5).
		const baselineResult = await snapshotAndDetectDrift({ provider: 'slack', client: makeFakeClient(slackBefore.tools) });
		const snapshotPath = resolveSchemaSnapshotPath('slack');

		// Subsequent connect with same schema → still changed=false.
		const identicalResult = await snapshotAndDetectDrift({ provider: 'slack', client: makeFakeClient(slackBefore.tools) });

		// Subsequent connect with modified schema → changed=true with per-tool diff.
		const driftResult = await snapshotAndDetectDrift({ provider: 'slack', client: makeFakeClient(slackAfter.tools) });

		expect({
			baseline: { changed: baselineResult.changed, changeCount: baselineResult.changes.length },
			snapshotWritten: existsSync(snapshotPath),
			identical: { changed: identicalResult.changed, changeCount: identicalResult.changes.length },
			drift: {
				changed: driftResult.changed,
				changeCount: driftResult.changes.length,
				toolName: driftResult.changes[0]?.tool,
				wasIsHex: /^[0-9a-f]{64}$/.test(driftResult.changes[0]?.was ?? ''),
				nowIsHex: /^[0-9a-f]{64}$/.test(driftResult.changes[0]?.now ?? ''),
				wasDiffersFromNow: driftResult.changes[0] ? driftResult.changes[0].was !== driftResult.changes[0].now : false,
			},
		}).toEqual({
			baseline: { changed: false, changeCount: 0 },
			snapshotWritten: true,
			identical: { changed: false, changeCount: 0 },
			drift: {
				changed: true,
				changeCount: 1,
				toolName: 'thread_fetch',
				wasIsHex: true,
				nowIsHex: true,
				wasDiffersFromNow: true,
			},
		});
	});

	it('SC #3 — pool transitions to paused_drift on schema mismatch + getSchemaDriftReport surfaces affected provider', async () => {
		// 1. Pre-seed the snapshot at slack-before tools so subsequent connect with slack-after
		//    triggers drift.
		const beforeSnapshot: ProviderSnapshot = {
			provider: 'slack',
			recorded_at: '2026-05-08T00:00:00.000Z',
			tools: slackBefore.tools.map((t) => ({
				name: t.name,
				input_schema_hash: canonicalHash(t.raw_schema.input),
				output_schema_hash: canonicalHash(t.raw_schema.output ?? null),
				raw_schema: t.raw_schema,
			})),
		};
		writeSnapshot(beforeSnapshot);

		// 2. Build a pool with an injected stdio factory that returns slack-after tools.
		const registry = new ToolRegistry();
		const pool = new McpClientPool({
			configs: [makeProviderConfig({ provider: 'slack' })],
			registry,
			onObservation: async () => undefined,
			backoff: { maxAttempts: 1, baseMs: 1, cooldownMs: 1 },
			stdioFactory: makeFakeStdioFactory(slackAfter.tools),
		});

		try {
			await pool.start();

			// 3. Pool should transition to paused_drift; tools must NOT be registered (no silent rewrite).
			const state = pool.getProviderState('slack');
			const slackToolsRegistered = registry.listByProvider('slack').length;

			// 4. Schema-drift report surfaces the affected provider with a one-line summary.
			const report = pool.getSchemaDriftReport();
			const slackEntry = report.find((e) => e.provider === 'slack');
			const reportShape = {
				count: report.length,
				slack: slackEntry ? { paused: slackEntry.paused, hasSummary: typeof slackEntry.drift_summary === 'string' && slackEntry.drift_summary.length > 0, summaryMentionsThread: slackEntry.drift_summary?.includes('thread_fetch') ?? false } : null,
			};

			expect({
				state,
				slackToolsRegistered,
				reportShape,
			}).toEqual({
				state: 'paused_drift',
				slackToolsRegistered: 0,
				reportShape: {
					count: 1,
					slack: { paused: true, hasSummary: true, summaryMentionsThread: true },
				},
			});
		} finally {
			await pool.close();
		}
	}, 15_000);

	it('SC #3 — Accept-new-schema flow: acceptProviderSchemaDrift re-baselines snapshot; reconnect clears paused_drift', async () => {
		// 1. Pre-seed snapshot at slack-before so first connect triggers drift.
		const beforeSnapshot: ProviderSnapshot = {
			provider: 'slack',
			recorded_at: '2026-05-08T00:00:00.000Z',
			tools: slackBefore.tools.map((t) => ({
				name: t.name,
				input_schema_hash: canonicalHash(t.raw_schema.input),
				output_schema_hash: canonicalHash(t.raw_schema.output ?? null),
				raw_schema: t.raw_schema,
			})),
		};
		writeSnapshot(beforeSnapshot);

		const registry = new ToolRegistry();
		const pool = new McpClientPool({
			configs: [makeProviderConfig({ provider: 'slack' })],
			registry,
			onObservation: async () => undefined,
			backoff: { maxAttempts: 1, baseMs: 1, cooldownMs: 1 },
			stdioFactory: makeFakeStdioFactory(slackAfter.tools),
		});

		// Wire the accept callback the daemon would normally inject (re-snapshot + persist).
		pool.setAcceptCallback(async (provider, client) => {
			const r = await client.listTools();
			const fresh: ProviderSnapshot = {
				provider,
				recorded_at: new Date().toISOString(),
				tools: r.tools.map((t) => ({
					name: t.name,
					input_schema_hash: canonicalHash(t.inputSchema),
					output_schema_hash: canonicalHash((t as { outputSchema?: unknown }).outputSchema ?? null),
					raw_schema: { input: t.inputSchema, output: (t as { outputSchema?: unknown }).outputSchema },
				})),
			};
			acceptProviderSchemaDrift(fresh);
		});

		try {
			await pool.start();
			const beforeAcceptState = pool.getProviderState('slack');
			const beforeAcceptReport = pool.getSchemaDriftReport().find((e) => e.provider === 'slack');

			// 2. Operator clicks Accept-new-schema → bridge calls mcp.acceptProviderSchemaDrift →
			//    pool.acceptProviderSchemaDrift returns true (snapshot persisted to disk).
			const accepted = await pool.acceptProviderSchemaDrift('slack');

			// 3. Verify the on-disk snapshot now matches slack-after hashes (re-baseline).
			const persisted = readSnapshot('slack');
			const persistedThreadFetch = persisted?.tools.find((t) => t.name === 'thread_fetch');
			const expectedAfterHash = canonicalHash(slackAfter.tools.find((t) => t.name === 'thread_fetch')!.raw_schema.input);

			// 4. Reconnect: pool calls snapshotAndDetectDrift again with slack-after tools; the
			//    new baseline matches so changed=false; tools register cleanly.
			await pool.reconnect('slack');
			const afterReconnectState = pool.getProviderState('slack');
			const afterReconnectTools = registry.listByProvider('slack').map((r) => r.originalName).sort();

			expect({
				beforeAcceptState,
				beforeAcceptPaused: beforeAcceptReport?.paused,
				accepted,
				persistedSnapshotMatchesAfter: persistedThreadFetch?.input_schema_hash === expectedAfterHash,
				afterReconnectState,
				afterReconnectTools,
			}).toEqual({
				beforeAcceptState: 'paused_drift',
				beforeAcceptPaused: true,
				accepted: true,
				persistedSnapshotMatchesAfter: true,
				afterReconnectState: 'connected',
				afterReconnectTools: ['thread_fetch'], // slack-after fixture has only thread_fetch (the drift target)
			});
		} finally {
			await pool.close();
		}
	}, 15_000);

	it('SC #3 — acceptProviderSchemaDrift returns false when no drift active (idempotent no-op)', async () => {
		const registry = new ToolRegistry();
		const pool = new McpClientPool({
			configs: [makeProviderConfig({ provider: 'slack' })],
			registry,
			onObservation: async () => undefined,
			backoff: { maxAttempts: 1, baseMs: 1, cooldownMs: 1 },
			stdioFactory: makeFakeStdioFactory(slackBefore.tools),
		});

		try {
			// First connect: no prior snapshot → writes baseline + connected (no drift).
			await pool.start();
			const state = pool.getProviderState('slack');

			// Accept call when not in paused_drift → returns false (idempotent no-op).
			const accepted = await pool.acceptProviderSchemaDrift('slack');

			expect({ state, accepted }).toEqual({ state: 'connected', accepted: false });
		} finally {
			await pool.close();
		}
	}, 15_000);
});
