/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/daemon/index.ts — Phase 5 (Plan 05-02) startDaemon entry point.
//
// Wires lockfile + port-discovery + auth-token + RPC server. Owns the lockfile
// lifecycle (atomic create on start, unlink on clean shutdown) and the per-socket auth
// gate (first request MUST be harvester.authenticate; subsequent requests pass through).
//
// The TCP-mode RPC server reuses the same handler-binding logic as stdio mode via
// kernel/src/rpc/server.ts createKernelRpcServer factory.

import * as net from 'node:net';
import { existsSync, realpathSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { bindEphemeralPort, createTcpRpcServer } from './port-discovery.js';
import { generateAuthToken } from './auth-token.js';
import { atomicCreateLockfile, clearStaleLockfile, isPidAlive, readLockfile, type LockfileContent } from './lockfile.js';
import { resolveLockfilePath } from './paths.js';
import type { GraphDAO } from '../graph/index.js';
import type { ReceiptDAO } from '../receipt/index.js';
import type Database from 'better-sqlite3';
import { bindHandlersForTcp, type SocketAuthState } from '../rpc/server.js';
import { OffsetsDao } from '../harvester/offsets.js';
import { submitRawObservation, type HarvesterDeps } from '../harvester/index.js';
import { startClaudeJsonlWatcher, type StopClaudeJsonlWatcher } from '../harvester/watchers/claude-jsonl.js';
import { enrichGitCommitObservation } from '../harvester/watchers/git.js';
import { incrementCorroborationAndMaybePromote } from '../harvester/promotion-gate/index.js';
import { resolveAnthropicApiKey } from '../harvester/promoter/index.js';
import { LivenessState } from '../harvester/liveness.js';
import { HarvestMetricsDao } from '../harvester/metrics.js';
import {
	MCP_DEFAULT_PORT,
	resolveBearerToken,
	registerGraphTools,
	type KeychainAdapter,
	type McpServerHandle,
	startMcpServer,
} from '../mcp/index.js';
import { McpClientPool } from '../mcp/clients/pool.js';
import { ToolRegistry } from '../mcp/registry.js';
import { buildProviderConfig } from '../mcp/clients/adapters/index.js';
import { makeLiveKeychainAdapter as makeMcpLiveKeychainAdapter } from '../mcp/auth/keychain.js';
import { routeMcpObservation } from '../mcp/clients/observation-router.js';
import { recordMcpObservation } from '../mcp/liveness.js';
import { acceptProviderSchemaDrift } from '../mcp/schema-drift/detector.js';
import type { McpControlSurface } from '../rpc/server.js';
import type { McpProviderName } from '../mcp/clients/types.js';
import { canonicalHash, type ProviderSnapshot, type ToolSchemaSnapshot } from '../mcp/schema-drift/snapshot.js';

export interface StartDaemonArgs {
	dao: GraphDAO;
	receiptDao: ReceiptDAO;
	sqlite: Database.Database;
	dbPath: string;
	version: string;
	/** Override lockfile path for tests. */
	lockfilePath?: string;
	/**
	 * Override JSONL watch paths for tests. Production defaults to
	 * `<homedir>/.claude/projects/**\/*.jsonl` per TELE-01. Pass `null` to opt out of
	 * starting the watcher entirely (tcp-rpc.spec.ts runs against a temp DB without
	 * touching real Claude transcripts).
	 */
	claudeJsonlWatchPaths?: readonly string[] | null;
	/**
	 * Plan 05-05 — workspace folder set passed into the project_relevant predicate.
	 * Production main.ts populates this from the bridge's workspace state (a future
	 * RPC); v1 starts empty (no scope = accept all paths).
	 */
	workspaceFolders?: readonly string[];
	/**
	 * Plan 05-06 — override Promoter context (test injection only). Production callers
	 * leave undefined; daemon constructs the live Anthropic SDK + keytar wiring.
	 */
	promoterCtx?: HarvesterDeps['promoterCtx'];
	/**
	 * Plan 06-02 — override MCP server config (test injection only). Production passes
	 * `undefined` to start the live HTTP listener on 127.0.0.1:7345; tests pass `null`
	 * to opt out entirely (rpc-only mode) or a partial object to override port/keychain
	 * (e.g. allocateLoopbackPort + makeKeychainMock for parallel tests).
	 */
	mcp?: null | {
		/** Port override (defaults to MCP_DEFAULT_PORT). */
		port?: number;
		/** Keychain adapter override (defaults to live keytar). */
		keychain?: KeychainAdapter;
		/** Bearer token override (skip keychain resolution entirely). */
		bearerToken?: string;
	};
}

export interface DaemonHandle {
	port: number;
	authToken: string;
	lockfilePath: string;
	harvesterDeps: HarvesterDeps;
	/**
	 * Plan 06-02 — handle for the MCP HTTP server when started. Null when the daemon was
	 * started with `mcp: null` (test mode), or when MCP startup failed (logged + non-fatal).
	 */
	mcpServer: McpServerHandle | null;
	/** Plan 06-06 — McpClientPool the daemon supervises. Null when consume-side wasn't wired. */
	mcpClientPool: McpClientPool | null;
	close: () => Promise<void>;
}

/**
 * Start the kernel daemon: bind ephemeral loopback port, generate auth token, atomically
 * create lockfile (clearing stale lockfile if previous kernel pid is dead), wire RPC
 * server with auth gate, register clean-shutdown handlers.
 *
 * Throws if another live kernel is already serving (caller decides to exit cleanly).
 */
export async function startDaemon(args: StartDaemonArgs): Promise<DaemonHandle> {
	const lockfilePath = args.lockfilePath ?? resolveLockfilePath();
	const authToken = generateAuthToken();

	// Bind first so we have the port for the lockfile.
	const { server, port } = await bindEphemeralPort();

	// Phase 21 XREPO-01 -- resolve symlinks and normalize separators once before lockfile construction.
	// Graceful fallback: if the DB file does not exist yet (rare in practice -- callers run
	// openDatabase before startDaemon), realpathSync would throw ENOENT; use the raw path so
	// the startup guard is still written to the lockfile (the path will be consistent within
	// a single test run where the file doesn't exist yet).
	let canonicalDbPath: string;
	try {
		canonicalDbPath = realpathSync(args.dbPath);
	} catch {
		canonicalDbPath = args.dbPath;
	}

	const content: LockfileContent = {
		pid: process.pid,
		rpc_port: port,
		auth_token: authToken,
		started_at: new Date().toISOString(),
		version: args.version,
		db_path: canonicalDbPath,
	};

	// Atomic-create with one stale-clear retry. Two concurrent kernels racing here will
	// see one 'created' and one 'exists'; the 'exists' loser reads the existing lockfile
	// and decides whether to clear-and-retry (dead pid) or surrender (live pid).
	let creationResult = atomicCreateLockfile(lockfilePath, content);
	if (creationResult === 'exists') {
		const existing = readLockfile(lockfilePath);
		if (existing && isPidAlive(existing.pid)) {
			// Phase 21 XREPO-01 -- dbPath-keyed second-opener fence.
			if (existing.db_path && existing.db_path === canonicalDbPath) {
				await new Promise<void>((r) => server.close(() => r()));
				throw new Error(
					`startDaemon: another kernel daemon is already serving the same graph.db ` +
					`(pid=${existing.pid}, port=${existing.rpc_port}, db_path=${existing.db_path}). ` +
					`Single-DB WAL isolation: only one daemon may readwrite-open the same DB file.`,
				);
			}
			await new Promise<void>((r) => server.close(() => r()));
			throw new Error(`startDaemon: another kernel daemon is already serving (pid=${existing.pid}, port=${existing.rpc_port})`);
		}
		// Stale (dead pid or corrupt) — clear + retry once.
		clearStaleLockfile(lockfilePath);
		creationResult = atomicCreateLockfile(lockfilePath, content);
		if (creationResult === 'exists') {
			await new Promise<void>((r) => server.close(() => r()));
			throw new Error(`startDaemon: lockfile race lost on retry (pid=${process.pid})`);
		}
	}

	// Phase 5 Plan 05-03 + Plan 05-05 — harvester deps + JSONL watcher bootstrap. The
	// deps bag is shared between in-process watchers (JSONL) and the cross-process RPC
	// handler (bridge → harvester.submitObservation, registered by bindHandlersForTcp via
	// args.harvesterDeps closure resolution). Plan 05-05 wires the dao + workspaceFolders
	// into deps so the Portability Filter cascade runs against the live graph; promoter /
	// liveness slots remain Plans 05-06 / 05-07.
	const offsetsDao = new OffsetsDao(args.sqlite);
	// Plan 05-07 — TELE-06 in-memory watchdog + PORT-06 daily metrics DAO. One LivenessState
	// per daemon process; the bridge polls harvester.getLiveness on the bridge side every
	// 30s. HarvestMetricsDao wraps the harvest_metrics_daily table created by 0005.
	// Phase 11 Plan 11-04 — test-only stale-source forcing. When
	// GOATIDE_LIVENESS_TEST_FORCE_STALE_SOURCES is set (comma-separated source list), the
	// LivenessState reports those sources as stale regardless of whether they have ever
	// been observed. Bypasses the cold-start grace period documented in liveness.ts. Empty
	// or unset in production. The visual-ceremony harness sets this for VIS-04.
	const testForcedStaleSources = parseForcedStaleSourcesFromEnv();
	const livenessState = new LivenessState(undefined, { testForcedStaleSources });
	const metricsDao = new HarvestMetricsDao(args.sqlite);
	const harvesterDeps: HarvesterDeps = {
		enrichGit: enrichGitCommitObservation,
		dao: args.dao,
		workspaceFolders: args.workspaceFolders ?? [],
		livenessState,
		metrics: metricsDao,
		// Phase 5 Plan 05-06 PORT-05 (b): net_new-rejection corroboration callback wired
		// to the real promotion-gate counter. The corroboration counter serializes
		// per-nodeId via the gate's queue (Pitfall 9).
		onCorroborationCandidate: async (existingNodeId, observationSource) => {
			await incrementCorroborationAndMaybePromote({
				dao: args.dao,
				nodeId: existingNodeId,
				observationProvenanceSource: `harvester:${observationSource}`,
			});
		},
		// Phase 5 Plan 05-06 PORT-04: Promoter context wired with keytar API-key resolver
		// + lazy-loaded Anthropic SDK. Production runs in live mode; if no key is
		// configured the Promoter returns transport_error and the observation is dropped
		// (no Inferred seed). Tests inject their own promoterCtx to opt out.
		promoterCtx: args.promoterCtx ?? {
			resolveApiKey: resolveAnthropicApiKey,
			model: 'claude-3-5-sonnet-20241022',
			sdkCall: async (params) => {
				const { default: Anthropic } = await import('@anthropic-ai/sdk');
				const apiKey = await resolveAnthropicApiKey();
				const client = new Anthropic({ apiKey: apiKey ?? undefined, maxRetries: 0 });
				const response = await client.messages.create({
					model: params.model,
					max_tokens: params.max_tokens,
					system: params.system,
					messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
					tools: params.tools.map((t) => ({
						name: t.name,
						description: t.description,
						input_schema: t.input_schema as { type: 'object'; properties?: unknown },
					})),
					tool_choice: params.tool_choice,
				});
				// Narrow to the FixtureMessageResponse-compatible shape (only the fields
				// the Promoter's parser cares about).
				return {
					content: response.content as ReadonlyArray<
						| { type: 'tool_use'; id: string; name: string; input: unknown }
						| { type: 'text'; text: string }
					>,
					model: response.model,
					role: 'assistant' as const,
					stop_reason: (response.stop_reason ?? 'end_turn') as 'tool_use' | 'end_turn' | 'max_tokens',
					usage: {
						input_tokens: response.usage.input_tokens,
						output_tokens: response.usage.output_tokens,
					},
				};
			},
		},
	};

	// Plan 06-06 — McpClientPool wired BEFORE the TCP RPC server so the bind path can pass
	// the pool as the mcpControl surface. Pool startup is deliberately FIRE-AND-FORGET: the
	// daemon doesn't block on provider connections (they may take seconds to initialize over
	// stdio) and per-provider failures are isolated by the pool itself. Token-less providers
	// short-circuit to `paused_auth` via the adapter returning null.
	const mcpToolRegistry = new ToolRegistry();
	const mcpClientPool = await maybeBuildMcpClientPool({
		harvesterDeps,
		registry: mcpToolRegistry,
	});
	if (mcpClientPool) {
		// Plan 06-06 — operator-accept hook. The pool calls this when the bridge sends
		// mcp.acceptProviderSchemaDrift; we re-snapshot the provider's current tools and
		// persist as the new baseline via the schema-drift module.
		mcpClientPool.setAcceptCallback(async (provider, client) => {
			const allTools: Array<{ name: string; inputSchema: unknown; outputSchema?: unknown }> = [];
			let cursor: string | undefined;
			while (true) {
				const r = await client.listTools(cursor ? { cursor } : undefined);
				for (const t of r.tools) {
					allTools.push({ name: t.name, inputSchema: t.inputSchema, outputSchema: (t as { outputSchema?: unknown }).outputSchema });
				}
				if (!r.nextCursor) {
					break;
				}
				cursor = r.nextCursor;
			}
			const tools: ToolSchemaSnapshot[] = allTools.map(t => ({
				name: t.name,
				input_schema_hash: canonicalHash(t.inputSchema),
				output_schema_hash: canonicalHash(t.outputSchema ?? null),
				raw_schema: { input: t.inputSchema, output: t.outputSchema },
			}));
			const snapshot: ProviderSnapshot = {
				provider,
				recorded_at: new Date().toISOString(),
				tools,
			};
			acceptProviderSchemaDrift(snapshot);
		});
		// Kick the pool but don't await — partial startup is the contract.
		void mcpClientPool.start().catch((e) => {
			console.error(`[daemon] McpClientPool start failed: ${e instanceof Error ? e.message : String(e)}`);
		});
	}

	// Wire each incoming socket: per-connection auth state map, first-request must be
	// authenticate, subsequent requests gated.
	const sockets = new Set<net.Socket>();
	const mcpControl: McpControlSurface | undefined = mcpClientPool
		? {
			getProviderState: (p) => mcpClientPool.getProviderState(p),
			getSchemaDriftReport: () => mcpClientPool.getSchemaDriftReport(),
			acceptProviderSchemaDrift: (p) => mcpClientPool.acceptProviderSchemaDrift(p),
			reconnect: (p) => mcpClientPool.reconnect(p),
			// Plan 10-02 (POLISH-02) — delegates to the pool's configured provider list. The
			// server.ts handler is registered unconditionally; when mcpClientPool is null
			// (no env vars / no providers configured) the entire mcpControl is undefined and
			// the handler nullish-coalesces to `{providers: []}` — exactly the empty-array
			// signal the bridge SchemaDriftBanner needs to suppress its 30s poll loop.
			listProviders: () => mcpClientPool.listProviders(),
		}
		: maybeBuildMcpTestStubControl();
	createTcpRpcServer(server, (socket, connection) => {
		sockets.add(socket);
		socket.once('close', () => sockets.delete(socket));
		const authState: SocketAuthState = { authenticated: false };
		bindHandlersForTcp({
			connection,
			socket,
			authState,
			expectedToken: authToken,
			dao: args.dao,
			receiptDao: args.receiptDao,
			sqlite: args.sqlite,
			dbPath: args.dbPath,
			harvesterDeps,
			mcpControl,
		});
		connection.listen();
	});

	// Start the Claude JSONL watcher unless the test harness opts out via null. The
	// 05-RESEARCH.md ## Pattern: Tail Observer with Persisted Offset says watch
	// ~/.claude/projects/**\/*.jsonl. Tests pass an explicit temp path.
	let stopJsonlWatcher: StopClaudeJsonlWatcher | null = null;
	if (args.claudeJsonlWatchPaths !== null) {
		const watchPaths = args.claudeJsonlWatchPaths
			?? [join(homedir(), '.claude', 'projects', '**', '*.jsonl')];
		try {
			stopJsonlWatcher = await startClaudeJsonlWatcher({
				watchPaths,
				offsets: offsetsDao,
				submit: (obs) => submitRawObservation(obs, harvesterDeps),
			});
		} catch (e) {
			// Watcher startup failure is non-fatal: the daemon still serves RPC; the
			// bridge can submit observations directly. Log to stderr (kernel.log).
			console.error(`[daemon] startClaudeJsonlWatcher failed: ${e instanceof Error ? e.message : String(e)}`);
		}
	}

	// Plan 06-02 — start the MCP HTTP server alongside the TCP RPC server. The MCP server
	// is a SECOND listener on the same daemon process: same lifetime, same shutdown chain,
	// distinct socket (127.0.0.1:7345), distinct auth gate (bearer token in keychain). MCP
	// startup failure (port in use, keychain unreachable) is non-fatal: the daemon continues
	// serving TCP RPC so the in-IDE bridge keeps working even when external MCP is degraded.
	let mcpServer: McpServerHandle | null = null;
	if (args.mcp !== null) {
		const mcpConfig = args.mcp ?? {};
		try {
			const keychain: KeychainAdapter = mcpConfig.keychain ?? (await loadLiveKeytarAdapter());
			const bearerToken = mcpConfig.bearerToken
				?? await resolveBearerToken({ keychain, generate: true });
			if (!bearerToken) {
				console.error(`[daemon] MCP server skipped: bearer token unavailable (keychain returned null)`);
			} else {
				mcpServer = await startMcpServer({
					port: mcpConfig.port ?? MCP_DEFAULT_PORT,
					bearerToken,
					registerTools: (s) => registerGraphTools(s, { dao: args.dao, sqlite: args.sqlite, harvesterDeps }),
				});
			}
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			// EADDRINUSE on the constitutional port is the most common production failure;
			// surface it as a structured event so logs are grep-able for support.
			const isPortInUse = msg.includes('EADDRINUSE');
			console.error(`[daemon] MCP server start failed${isPortInUse ? ' (mcp_port_in_use)' : ''}: ${msg}`);
		}
	}

	let closed = false;
	const close = async (): Promise<void> => {
		if (closed) {
			return;
		}
		closed = true;
		// Stop watchers first so they don't try to submit while sockets are tearing down.
		if (stopJsonlWatcher) {
			try { await stopJsonlWatcher(); } catch { /* best-effort */ }
		}
		// Plan 06-06 — close the McpClientPool before the MCP HTTP server. The pool's
		// stdio children must exit cleanly (close() awaits SDK Client.close() per provider)
		// before we tear down the TCP RPC layer the bridge uses to observe state.
		if (mcpClientPool) {
			try { await mcpClientPool.close(); } catch { /* best-effort */ }
		}
		// Plan 06-02 — close the MCP HTTP server before tearing down the TCP RPC socket
		// chain. Order matters: the MCP server has its own keep-alive connections that
		// must drain cleanly so external clients see a graceful close, not an RST.
		if (mcpServer) {
			try { await mcpServer.close(); } catch { /* best-effort */ }
		}
		// Destroy all open sockets; close server.
		for (const s of sockets) {
			try { s.destroy(); } catch { /* best-effort */ }
		}
		await new Promise<void>((r) => server.close(() => r()));
		// Only unlink the lockfile if it still belongs to us — defense against the rare
		// case where another daemon overwrote ours during shutdown (shouldn't happen,
		// but cheap to verify).
		try {
			const current = readLockfile(lockfilePath);
			if (current && current.pid === process.pid && existsSync(lockfilePath)) {
				unlinkSync(lockfilePath);
			}
		} catch { /* best-effort */ }
	};

	const cleanup = (): void => {
		void close();
	};
	process.once('SIGTERM', cleanup);
	process.once('SIGINT', cleanup);
	process.once('beforeExit', cleanup);

	return { port, authToken, lockfilePath, harvesterDeps, mcpServer, mcpClientPool, close };
}

/**
 * Plan 06-06 — construct the McpClientPool from the live keychain + adapter dispatcher.
 * Returns null on any unrecoverable error (logs to stderr); the daemon proceeds without
 * MCP consume-side support (the bridge's banners stay hidden — same as if mcpControl were
 * absent).
 *
 * The 4 adapters require a per-provider {command, args} pair (the path to the upstream
 * provider's MCP stdio binary). Plan 06-06 v1 reads these from environment variables:
 *   GOATIDE_MCP_<PROVIDER>_COMMAND, GOATIDE_MCP_<PROVIDER>_ARGS (space-separated),
 *   GOATIDE_MCP_<PROVIDER>_CWD (optional). When the COMMAND env is unset the provider is
 *   silently skipped. ATLASSIAN_EMAIL must also be set for jira (it's config data + non-secret).
 *
 * Per-provider auth gating: providers whose adapter returns null (no credentials configured)
 * are silently skipped — the pool isn't constructed with their config so they don't appear
 * in the pool's entry map. The bridge will surface the absence via an empty `getProviderState`
 * (returns 'closed' for unknown providers).
 *
 * End-to-end daemon-boot smoke is exercised by Plan 06-07's SC integration specs.
 */
async function maybeBuildMcpClientPool(deps: {
	harvesterDeps: HarvesterDeps;
	registry: ToolRegistry;
}): Promise<McpClientPool | null> {
	try {
		const keychain = makeMcpLiveKeychainAdapter();
		const providers: McpProviderName[] = ['github', 'slack', 'linear', 'jira'];
		const configs: import('../mcp/clients/types.js').McpProviderConfig[] = [];
		for (const provider of providers) {
			const command = process.env[`GOATIDE_MCP_${provider.toUpperCase()}_COMMAND`];
			if (!command) {
				continue;
			}
			const argsRaw = process.env[`GOATIDE_MCP_${provider.toUpperCase()}_ARGS`] ?? '';
			const cmdArgs = argsRaw.length > 0 ? argsRaw.split(' ').filter((s) => s.length > 0) : [];
			const cwd = process.env[`GOATIDE_MCP_${provider.toUpperCase()}_CWD`];
			if (provider === 'github') {
				const r = await buildProviderConfig({ provider: 'github', keychain, command, args: cmdArgs, cwd });
				if (r.provider === 'github' && r.config) {
					configs.push(r.config);
				}
			} else if (provider === 'jira') {
				const email = process.env.ATLASSIAN_EMAIL;
				if (!email) {
					continue;
				}
				const r = await buildProviderConfig({ provider: 'jira', keychain, command, args: cmdArgs, cwd, email });
				if (r.provider === 'jira' && r.config) {
					configs.push(r.config);
				}
			} else if (provider === 'slack') {
				const r = await buildProviderConfig({ provider: 'slack', keychain, command, args: cmdArgs, cwd });
				if (r.provider === 'slack' && r.result) {
					configs.push(r.result.config);
				}
			} else if (provider === 'linear') {
				const r = await buildProviderConfig({ provider: 'linear', keychain, command, args: cmdArgs, cwd });
				if (r.provider === 'linear' && r.result) {
					configs.push(r.result.config);
				}
			}
		}
		if (configs.length === 0) {
			console.error('[daemon] McpClientPool skipped: no provider configs in env (set GOATIDE_MCP_<PROVIDER>_COMMAND + run `goatide-cli mcp configure --provider <name>`)');
			return null;
		}
		const pool = new McpClientPool({
			configs,
			registry: deps.registry,
			onObservation: async (raw) => {
				// Plan 06-05 + 06-06: route the tool-call result through the harvester filter
				// cascade AND tag a per-provider liveness observation so the bridge banner can
				// see the provider as live.
				try {
					await routeMcpObservation({
						provider: raw.provider,
						tool_name: raw.tool_name,
						arguments: raw.arguments,
						result: raw.result,
						deps: deps.harvesterDeps,
					});
				} finally {
					if (deps.harvesterDeps.livenessState) {
						recordMcpObservation(deps.harvesterDeps.livenessState, raw.provider);
					}
				}
			},
		});
		return pool;
	} catch (e) {
		console.error(`[daemon] McpClientPool construction failed: ${e instanceof Error ? e.message : String(e)}`);
		return null;
	}
}

/**
 * Phase 11 Plan 11-04 VIS-04 — test-only parser for the comma-separated list of
 * harvester sources that should be force-reported as stale. Used by the visual-ceremony
 * harness to exercise the LivenessBanner without firing real observations. Returns an
 * empty array when the env var is unset, empty, or contains only unknown source names.
 *
 * Unknown source names are silently skipped (logged at info level via stderr) so a typo
 * in the env var doesn't break the daemon. Production sets nothing — empty array means
 * the cold-start grace period is preserved.
 */
function parseForcedStaleSourcesFromEnv(): import('../harvester/observations.js').ObservationSource[] {
	const raw = process.env.GOATIDE_LIVENESS_TEST_FORCE_STALE_SOURCES;
	if (!raw) {
		return [];
	}
	const validSources: ReadonlySet<string> = new Set<string>([
		'claude_jsonl', 'editor_save', 'terminal_shell', 'git_commit', 'mcp_external_signal',
	]);
	const out: import('../harvester/observations.js').ObservationSource[] = [];
	for (const token of raw.split(',')) {
		const name = token.trim();
		if (name.length === 0) {
			continue;
		}
		if (validSources.has(name)) {
			out.push(name as import('../harvester/observations.js').ObservationSource);
		} else {
			console.error(`[daemon] GOATIDE_LIVENESS_TEST_FORCE_STALE_SOURCES: unknown source '${name}' (expected one of ${[...validSources].join(', ')}); skipping`);
		}
	}
	if (out.length > 0) {
		console.error(`[daemon] LivenessState test stub: forcing stale=true for sources [${out.join(', ')}]`);
	}
	return out;
}

/**
 * Phase 11 Plan 11-04 VIS-05 — test-only McpControlSurface stub.
 *
 * When `GOATIDE_MCP_TEST_DRIFT_PROVIDER=<name>` is set in the daemon process env (the
 * visual-ceremony harness sets it before launching Electron), synthesizes a minimal
 * McpControlSurface that reports the named provider as paused on schema drift. This
 * bypasses the McpClientPool (no stdio children, no keychain, no real provider config)
 * so the bridge's SchemaDriftBanner can be exercised in isolation against the live
 * Electron build.
 *
 * Returns undefined when the env var is unset or holds an invalid provider name. The
 * caller then propagates `undefined` to `bindHandlersForTcp`, where the server.ts
 * `mcp.listProviders` handler nullish-coalesces to `{providers: []}` — preserving the
 * Plan 10-02 POLISH-02 SchemaDriftBanner precondition gate for production.
 */
function maybeBuildMcpTestStubControl(): McpControlSurface | undefined {
	const raw = process.env.GOATIDE_MCP_TEST_DRIFT_PROVIDER;
	if (!raw) {
		return undefined;
	}
	const provider = raw.trim();
	const validProviders: readonly string[] = ['github', 'slack', 'linear', 'jira'];
	if (!validProviders.includes(provider)) {
		console.error(`[daemon] GOATIDE_MCP_TEST_DRIFT_PROVIDER='${raw}' invalid; expected one of ${validProviders.join(', ')} — ignoring test stub`);
		return undefined;
	}
	const driftSummary = process.env.GOATIDE_MCP_TEST_DRIFT_SUMMARY ?? `VIS-05 test stub: ${provider} paused on schema drift`;
	console.error(`[daemon] McpControlSurface test stub active: provider=${provider} paused=true (VIS-05 path; no real MCP pool)`);
	const typedProvider = provider as McpProviderName;
	return {
		getProviderState: (p) => (p === typedProvider ? 'paused_drift' : 'closed'),
		getSchemaDriftReport: () => [{ provider: typedProvider, paused: true, drift_summary: driftSummary }],
		acceptProviderSchemaDrift: async () => true,
		reconnect: async () => { /* no-op for the test stub */ },
		listProviders: () => [typedProvider],
	};
}

/**
 * Lazy-load the live keytar binding and adapt it to KeychainAdapter. Mirrors the lazy-
 * import pattern in kernel/src/harvester/promoter/keytar-resolver.ts so the native binding
 * is only loaded on the production path — unit tests inject a mock via mcp.keychain.
 */
async function loadLiveKeytarAdapter(): Promise<KeychainAdapter> {
	const keytar = await import('keytar');
	return {
		async getPassword(service, account) {
			return keytar.getPassword(service, account);
		},
		async setPassword(service, account, password) {
			await keytar.setPassword(service, account, password);
		},
	};
}

export { resolveLockfilePath } from './paths.js';
export { readLockfile, isPidAlive, clearStaleLockfile, type LockfileContent } from './lockfile.js';
