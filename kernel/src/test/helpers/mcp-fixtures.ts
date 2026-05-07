/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/helpers/mcp-fixtures.ts — Phase 6 reusable test helpers.
//
// Mirror of harvester-fixtures.ts (Phase 5): pure factory functions, defaults overridable
// via Partial<T>, no live network/keychain inside the helpers. Reused by every Phase-6 spec
// across Plans 06-02..06. The interfaces below intentionally match the wire-shape of the
// in-flight types in kernel/src/mcp/* (Plans 06-02..04) — they are fixture-only and do NOT
// replace those source-of-truth definitions when those land.

import { spawn, type ChildProcess } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'node:net';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * The 4 MCP providers gateway-consumed in Phase 6 (FORK-08 dogfood-relevant set):
 * GitHub, Slack, Linear, Jira. Adding a 5th provider is a Phase-6-iter task.
 */
export type McpProviderName = 'github' | 'slack' | 'linear' | 'jira';

/**
 * Per-provider stdio transport config. `command` + `args` describe how to spawn the
 * provider's MCP stdio binary; `env` is the additional environment merged with
 * process.env (Pitfall 2: spread process.env first then adapter env to preserve PATH).
 */
export interface McpProviderConfig {
	provider: McpProviderName;
	command: string;
	args: string[];
	env?: Record<string, string>;
	cwd?: string;
}

/**
 * Handle returned by makeMockMcpServerProcess. Holds the spawned ChildProcess + a cleanup
 * function that closes stdin (graceful) then SIGTERMs (force) after a 50ms grace window.
 */
export interface MockMcpServerHandle {
	process: ChildProcess;
	cleanup: () => Promise<void>;
}

/**
 * Spawn the appropriate <provider>-mock.cjs over stdio. Mode controls the mock's behavior:
 *   - 'normal' (default): respond to initialize + tools/list + tools/call with fixture data.
 *   - 'revoked': respond to tools/call with the provider's revocation error shape.
 *   - 'crash': exit 1 immediately after handling initialize (used by isolation tests).
 */
export function makeMockMcpServerProcess(args: { provider: McpProviderName; mode?: 'normal' | 'revoked' | 'crash' }): MockMcpServerHandle {
	const mode = args.mode ?? 'normal';
	// __dirname here is dist/test/helpers/ at runtime, but vitest uses the .ts under src/.
	// The fixtures live under kernel/src/test/mcp/fixtures/mock-mcp-servers regardless.
	const fixtureRoot = resolve(__dirname, '..', 'mcp', 'fixtures', 'mock-mcp-servers');
	const fixturePath = resolve(fixtureRoot, `${args.provider}-mock.cjs`);
	const proc = spawn('node', [fixturePath, '--mode', mode], {
		stdio: ['pipe', 'pipe', 'pipe'],
		env: process.env,
	});
	const cleanup = async () => {
		if (!proc.killed) {
			try {
				proc.stdin?.end();
			} catch { /* ignore */ }
			await new Promise<void>(r => setTimeout(r, 50));
			if (!proc.killed) {
				proc.kill('SIGTERM');
			}
		}
	};
	return { process: proc, cleanup };
}

/**
 * Build a fully-formed McpProviderConfig with sensible defaults; overridable via partial.
 * Default provider='github' so callers needing "any provider" get a deterministic shape.
 */
export function makeProviderConfig(partial?: Partial<McpProviderConfig>): McpProviderConfig {
	const provider = partial?.provider ?? 'github';
	const fixtureRoot = resolve(__dirname, '..', 'mcp', 'fixtures', 'mock-mcp-servers');
	return {
		provider,
		command: partial?.command ?? 'node',
		args: partial?.args ?? [resolve(fixtureRoot, `${provider}-mock.cjs`)],
		env: partial?.env,
		cwd: partial?.cwd,
	};
}

/**
 * In-memory keychain replacement matching the keytar API surface. Used by Plan 06-04 adapter
 * tests so the host machine's OS keychain is never touched. Backed by a Map keyed by
 * `${service}:${account}` (the same shape keytar uses internally).
 */
export function makeKeychainMock(): {
	getPassword: (service: string, account: string) => Promise<string | null>;
	setPassword: (service: string, account: string, password: string) => Promise<void>;
	deletePassword: (service: string, account: string) => Promise<boolean>;
} {
	const store = new Map<string, string>();
	const k = (s: string, a: string) => `${s}:${a}`;
	return {
		getPassword: async (service, account) => store.get(k(service, account)) ?? null,
		setPassword: async (service, account, password) => { store.set(k(service, account), password); },
		deletePassword: async (service, account) => store.delete(k(service, account)),
	};
}

/**
 * Mirrors makeStaleClock in harvester-fixtures.ts: caller-controlled monotonic clock for
 * timer-driven tests (TokenRefreshScheduler in Plan 06-04, liveness threshold in Plan 06-06).
 */
export function makeStaleClock(initialMs: number): { now: () => number; advance: (deltaMs: number) => void } {
	let t = initialMs;
	return {
		now: () => t,
		advance: (deltaMs: number) => { t += deltaMs; },
	};
}

/**
 * Construct an SDK-shaped tools/list result for snapshot/drift tests. The shape matches the
 * @modelcontextprotocol/sdk Client.listTools() return: {tools: Tool[], nextCursor?: string}.
 * inputSchema/outputSchema are JSON Schema objects (intentionally untyped beyond
 * Record<string, unknown> — the SDK's Tool type widens to that).
 */
export function makeProviderToolListResult(
	provider: McpProviderName,
	toolNames: string[],
): { tools: Array<{ name: string; inputSchema: Record<string, unknown>; outputSchema?: Record<string, unknown> }>; nextCursor?: string } {
	const tools = toolNames.map(name => ({
		name,
		inputSchema: { type: 'object', properties: {}, additionalProperties: false } as Record<string, unknown>,
		outputSchema: undefined as Record<string, unknown> | undefined,
	}));
	// `_provider` is an internal sanity tag for tests that want to assert the helper was
	// called with the right provider; not part of the SDK shape.
	void provider;
	return { tools };
}

/**
 * Deterministic 64-hex-char bearer token for MCP-09 server tests. Avoids both Math.random
 * non-determinism and the security signal of hard-coding a real-looking secret in source.
 * The string is "feed" repeated to fill 64 chars — recognizable as a fixture in any leak.
 */
export function makeBearerToken(): string {
	return 'feed'.repeat(16); // 64 hex chars
}

/**
 * Bind 127.0.0.1:0, read the OS-assigned port, then close. Used by HTTP-server tests that
 * want a free loopback port without colliding with the constitutional 7345 (the production
 * MCP server port) when vitest runs in parallel.
 */
export async function allocateLoopbackPort(): Promise<number> {
	return new Promise<number>((resolveP, rejectP) => {
		const s = createServer();
		s.unref();
		s.on('error', rejectP);
		s.listen(0, '127.0.0.1', () => {
			const addr = s.address();
			if (typeof addr === 'object' && addr !== null && 'port' in addr) {
				const port = addr.port;
				s.close(() => resolveP(port));
			} else {
				s.close(() => rejectP(new Error('allocateLoopbackPort: unexpected listen address')));
			}
		});
	});
}
