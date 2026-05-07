/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/clients/pool.ts — Phase 6 (Plan 06-03) MCP-01 multi-provider stdio pool.
//
// Spawns + supervises 4 stdio MCP Client instances (one per FORK-08 provider: GitHub, Slack,
// Linear, Jira). Each provider's lifecycle is INDEPENDENT — failures in one provider do not
// take down the others (bulkhead isolation). Per-provider operations:
//
//   start()           Promise.all(configs.map(p -> startProvider(p))) — never short-circuits;
//                     each provider's startProvider rejection is isolated and the others
//                     continue. start() resolves once every provider has settled.
//   startProvider(p)  runWithBackoff over: createStdioClient -> snapshotAndDetectDrift ->
//                     listTools cursor walk -> registry.register() per tool. State machine
//                     transitions: connecting -> connected | paused_drift | restarting | closed.
//   close()           Awaited graceful close of every connected client (stdin-close + then
//                     SDK Client.close()). Sets per-provider state to 'closed'.
//   reconnect(p)      Used by Plan 06-06's CLI: tear down + restart a single provider.
//   handleError()     Called by createStdioClient's onError wiring: bumps generation,
//                     transitions state to 'restarting', re-invokes startProvider.
//
// Pitfall 4 (tool-level isError): handler dispatch checks result.isError BEFORE invoking
//   onObservation. Errors are logged + retried per the backoff policy but NEVER routed to
//   submitRawObservation — that contract is owned by the harvester / Plan 06-05.
// Pitfall 7 (listTools pagination): walk the nextCursor until exhausted.
// Plan 06-04 hand-off: snapshotAndDetectDrift import + call site is wired but the detector
//   currently returns no-drift. Plan 06-04 lands the real SHA-256 canonical-hash detector.

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';

import { runWithBackoff, type BackoffOptions } from '../backoff.js';
import { snapshotAndDetectDrift } from '../schema-drift/detector.js';
import { ToolRegistry } from '../registry.js';
import { createStdioClient as defaultCreateStdioClient, type StdioClientHandle } from './stdio-client.js';
import type {
	ExternalMcpRawObservation,
	McpClientHandle,
	McpProviderConfig,
	McpProviderName,
	ProviderState,
} from './types.js';

export interface McpClientPoolArgs {
	configs: McpProviderConfig[];
	registry: ToolRegistry;
	/**
	 * Callback invoked after a successful (non-isError) tool call. Plan 06-05 wires this to
	 * the observation router which calls submitRawObservation. For Plan 06-03 tests, this
	 * is a no-op or a recorder.
	 */
	onObservation: (input: ExternalMcpRawObservation) => Promise<void>;
	/** Backoff policy for per-provider startProvider supervision. Defaults to runWithBackoff defaults. */
	backoff?: BackoffOptions;
	/** Test-only injection: replace the real stdio-client factory with a fake for the backoff retry path. */
	stdioFactory?: (args: { cfg: McpProviderConfig; onError: (err: Error) => void; onClose?: () => void }) => Promise<StdioClientHandle>;
}

interface InternalEntry {
	cfg: McpProviderConfig;
	state: ProviderState;
	generation: number;
	client?: Client;
	handle?: McpClientHandle;
	supervisorRunning: boolean;
}

export class McpClientPool {
	private readonly registry: ToolRegistry;
	private readonly onObservation: (input: ExternalMcpRawObservation) => Promise<void>;
	private readonly backoff: BackoffOptions | undefined;
	private readonly stdioFactory: (args: { cfg: McpProviderConfig; onError: (err: Error) => void; onClose?: () => void }) => Promise<StdioClientHandle>;
	private readonly entries: Map<McpProviderName, InternalEntry> = new Map();
	private closed = false;

	constructor(args: McpClientPoolArgs) {
		this.registry = args.registry;
		this.onObservation = args.onObservation;
		this.backoff = args.backoff;
		this.stdioFactory = args.stdioFactory ?? defaultCreateStdioClient;
		for (const cfg of args.configs) {
			if (this.entries.has(cfg.provider)) {
				throw new Error(`McpClientPool: duplicate provider in configs: ${cfg.provider}`);
			}
			this.entries.set(cfg.provider, { cfg, state: 'connecting', generation: 0, supervisorRunning: false });
		}
	}

	/**
	 * Start every provider in parallel. Per-provider failures are isolated — a single
	 * provider's rejection does NOT cause start() to reject.
	 */
	async start(): Promise<void> {
		const tasks = [...this.entries.keys()].map(p =>
			this.startProvider(p).catch(err => {
				// Final failure for this provider; log and leave state at 'closed'.
				this.entries.get(p)!.state = 'closed';
				// eslint-disable-next-line no-console
				console.warn(`[mcp-pool] provider ${p} failed to start: ${(err as Error).message}`);
			}),
		);
		await Promise.all(tasks);
	}

	/**
	 * Start (or restart) a single provider. Wraps the connect+listTools+register flow in
	 * runWithBackoff. Increments the per-provider generation counter so any in-flight
	 * stale onError callbacks no-op.
	 */
	async startProvider(provider: McpProviderName): Promise<void> {
		const entry = this.entries.get(provider);
		if (!entry) {
			throw new Error(`McpClientPool: unknown provider ${provider}`);
		}
		if (this.closed) {
			return;
		}
		entry.supervisorRunning = true;
		const generation = ++entry.generation;
		entry.state = 'connecting';
		try {
			await runWithBackoff(async () => {
				if (this.closed || entry.generation !== generation) {
					return;
				}
				await this.attemptConnect(entry, generation);
			}, this.backoff);
		} finally {
			entry.supervisorRunning = false;
		}
	}

	private async attemptConnect(entry: InternalEntry, generation: number): Promise<void> {
		// Build the onError callback BEFORE the factory call so any synchronous transport
		// error during construction is captured by the wrapper.
		const onError = (err: Error) => {
			void this.handleError(entry.cfg.provider, generation, err);
		};
		// SDK fires Client.onclose when the underlying stdio child exits (e.g. crash mode);
		// treat that as a failure event identical to onerror so the supervisor restarts.
		const onClose = () => {
			void this.handleError(entry.cfg.provider, generation, new Error(`provider ${entry.cfg.provider} stdio child closed`));
		};
		const handle = await this.stdioFactory({ cfg: entry.cfg, onError, onClose });

		// If the supervisor was superseded while connect was in flight (e.g. concurrent
		// reconnect or close), drop this client immediately.
		if (entry.generation !== generation || this.closed) {
			try {
				await handle.client.close?.();
			} catch { /* ignore */ }
			return;
		}

		entry.client = handle.client;
		entry.handle = {
			provider: entry.cfg.provider,
			client: handle.client,
			transport: handle.transport,
			state: 'connecting',
			generation,
		};

		// Schema drift detection (Plan 06-04 fills in real impl; stub returns no-drift).
		const drift = await snapshotAndDetectDrift({ provider: entry.cfg.provider, client: handle.client });
		if (drift.changed) {
			entry.state = 'paused_drift';
			if (entry.handle) {
				entry.handle.state = 'paused_drift';
			}
			// Drift detected — skip tool registration. Plan 06-04's bridge wiring raises
			// the SchemaDriftBanner alert; we just hold off on dispatch until the operator
			// acknowledges the change and reconnects.
			return;
		}

		// Pitfall 7: listTools pagination — walk nextCursor until exhausted.
		this.registry.clearProvider(entry.cfg.provider);
		let cursor: string | undefined;
		while (true) {
			const r = await handle.client.listTools(cursor ? { cursor } : undefined);
			for (const tool of r.tools) {
				this.registry.register({
					provider: entry.cfg.provider,
					originalName: tool.name,
					inputSchema: tool.inputSchema,
					handler: this.makeToolHandler(entry.cfg.provider, tool.name),
				});
			}
			if (!r.nextCursor) {
				break;
			}
			cursor = r.nextCursor;
		}

		entry.state = 'connected';
		if (entry.handle) {
			entry.handle.state = 'connected';
		}
	}

	/**
	 * Per-tool handler factory. The handler:
	 *  1. Calls client.callTool(name, args).
	 *  2. Pitfall 4: if result.isError, throws (the registry caller can decide to retry +
	 *     bubble; observation router is NEVER invoked on isError).
	 *  3. On success, awaits onObservation with the ExternalMcpRawObservation shape.
	 */
	private makeToolHandler(provider: McpProviderName, originalName: string): (args: unknown) => Promise<unknown> {
		return async (args: unknown) => {
			const entry = this.entries.get(provider);
			if (!entry || !entry.client || entry.state !== 'connected') {
				throw new Error(`McpClientPool: provider ${provider} is not connected (state=${entry?.state ?? 'unknown'})`);
			}
			const result = await entry.client.callTool({ name: originalName, arguments: args as Record<string, unknown> });
			if (result.isError) {
				// Pitfall 4: do NOT route through onObservation; surface as throw so callers can retry.
				throw new Error(`McpClientPool: tool ${provider}__${originalName} returned isError`);
			}
			await this.onObservation({
				provider,
				tool_name: originalName,
				arguments: args,
				result,
				ts: new Date().toISOString(),
			});
			return result;
		};
	}

	/**
	 * Pool's onError sink. Stale callbacks (generation mismatch) are silently ignored.
	 * Otherwise transitions state to 'restarting' and re-invokes startProvider.
	 */
	private async handleError(provider: McpProviderName, generation: number, err: Error): Promise<void> {
		const entry = this.entries.get(provider);
		if (!entry || entry.generation !== generation || this.closed) {
			return;
		}
		entry.state = 'restarting';
		if (entry.handle) {
			entry.handle.state = 'restarting';
		}
		void err; // already implicit in the supervisor's caught rejection
		// Don't await: the caller is the SDK Client's onerror callback, which may run
		// inside the transport's own event loop. We schedule the supervisor restart
		// asynchronously and let it run independently.
		setImmediate(() => {
			if (!this.closed && !entry.supervisorRunning) {
				void this.startProvider(provider).catch(restartErr => {
					entry.state = 'closed';
					// eslint-disable-next-line no-console
					console.warn(`[mcp-pool] provider ${provider} restart failed: ${(restartErr as Error).message}`);
				});
			}
		});
	}

	/**
	 * Tear down + restart a single provider. Used by Plan 06-06's CLI `goatide-cli mcp reconnect <provider>`.
	 */
	async reconnect(provider: McpProviderName): Promise<void> {
		const entry = this.entries.get(provider);
		if (!entry) {
			throw new Error(`McpClientPool: unknown provider ${provider}`);
		}
		// Bump generation to invalidate any in-flight supervisor + onError callbacks.
		entry.generation++;
		if (entry.client) {
			try {
				await entry.client.close();
			} catch { /* ignore */ }
		}
		this.registry.clearProvider(provider);
		entry.client = undefined;
		entry.handle = undefined;
		await this.startProvider(provider);
	}

	/** Snapshot of a provider's current state. */
	getProviderState(provider: McpProviderName): ProviderState {
		const entry = this.entries.get(provider);
		return entry?.state ?? 'closed';
	}

	/**
	 * Graceful close: SDK Client.close() per provider; awaits all in parallel.
	 */
	async close(): Promise<void> {
		this.closed = true;
		const tasks: Promise<void>[] = [];
		for (const [provider, entry] of this.entries) {
			entry.generation++; // invalidate any in-flight supervisor
			if (entry.client) {
				const c = entry.client;
				tasks.push(
					(async () => {
						try {
							await c.close();
						} catch { /* ignore */ }
						entry.state = 'closed';
						if (entry.handle) {
							entry.handle.state = 'closed';
						}
					})(),
				);
			} else {
				entry.state = 'closed';
			}
			void provider;
		}
		await Promise.all(tasks);
	}
}
