/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/cli/commands/mcp.ts — Phase 6 (Plan 06-06) MCP-03 + MCP-06 + MCP-09 CLI surface.
//
// Three subcommands attached to `goatide-cli mcp`:
//
//   1. configure --provider <name> [--kind access|refresh|api] [--print-bearer]
//      Reads a token from stdin (silent / no-echo when supported) and writes it to the OS
//      keychain via the Plan-06-04 setProviderToken helper. --print-bearer skips token
//      ingestion and prints the SC #4 setup-ceremony bearer (the MCP HTTP server's gate
//      token); the bearer is shown ONCE so users can wire up external MCP clients.
//
//   2. status
//      Connects to the running daemon (lockfile-aware), authenticates, queries
//      mcp.getProviderState for each of the 4 providers + reads the bearer from the
//      keychain, prints a fixed-width table including the bearer fingerprint
//      (sha256(bearer).hex.slice(0, 16)) so the developer can verify which token is in
//      effect WITHOUT leaking the secret (MCP-09 + Pitfall 3 token-leak defense).
//
//   3. doctor
//      Preflight checks. Exits 0 when all green; exits 1 when any check fails.
//      Checks: keychain accessible (sentinel write/read/delete on a unique account name),
//      daemon reachable (lockfile present + pid alive), per-provider tokens present.
//
// All three subcommands work without a running daemon for the keychain-only operations
// (configure, doctor); status requires daemon. Mirrors the Phase-5 `harvest` registration
// pattern.

import type { Command } from 'commander';
import * as net from 'node:net';
import * as readline from 'node:readline';
import * as rpc from 'vscode-jsonrpc/node.js';
import {
	getProviderToken,
	setProviderToken,
	deleteProviderToken,
	makeLiveKeychainAdapter,
	providerAccount,
	type KeychainAdapter,
	type TokenKind,
} from '../../mcp/auth/keychain.js';
import {
	KEYCHAIN_ACCOUNT_BEARER,
	KEYCHAIN_SERVICE as MCP_BEARER_SERVICE,
	resolveBearerToken,
	sha256Fingerprint,
} from '../../mcp/index.js';
import { readLockfile, isPidAlive } from '../../daemon/lockfile.js';
import { resolveLockfilePath } from '../../daemon/paths.js';
import {
	AuthenticateRequest,
	McpGetProviderStateRequest,
	type McpGetProviderStateResult,
	type McpProviderNameWire,
	type McpProviderStateWire,
} from '../../rpc/methods.js';
import { formatError } from '../format.js';

const PROVIDERS: McpProviderNameWire[] = ['github', 'slack', 'linear', 'jira'];

/**
 * Default token kind per provider: github + jira are PAT/API-token (kind='api'); slack +
 * linear are OAuth (kind='access'). The CLI's --kind flag overrides for the rare case when
 * the operator wants to set a refresh token explicitly.
 */
function defaultKindForProvider(provider: McpProviderNameWire): TokenKind {
	if (provider === 'slack' || provider === 'linear') {
		return 'access';
	}
	return 'api';
}

/**
 * Register `mcp` and its 3 subcommands on the given parent. Mirrors registerHarvestCommand
 * (Phase-5 Plan 05-07) so the invocation is `goatide-cli mcp <sub>`, not `goatide-cli graph mcp <sub>`.
 *
 * Tests can inject `keychainOverride` to substitute the in-memory keychain mock so the host
 * OS keychain is never touched. Production passes nothing; the live keytar wrapper is used.
 */
export function registerMcpCommands(parent: Command, opts?: { keychainOverride?: KeychainAdapter }): void {
	const mcp = parent.command('mcp').description('Configure and inspect MCP providers');

	mcp.command('configure')
		.description('Configure a provider token (writes to OS keychain) or print the MCP bearer')
		.requiredOption('--provider <name>', `One of: ${PROVIDERS.join(', ')}`)
		.option('--kind <kind>', 'Token kind: access | refresh | api (default depends on provider)')
		.option('--print-bearer', 'Print the MCP HTTP server bearer token from keychain (one-time setup ceremony)')
		.option('--revoke', 'Delete the stored token instead of writing a new one')
		.action(async (rawOpts: { provider: string; kind?: string; printBearer?: boolean; revoke?: boolean }) => {
			try {
				const provider = parseProvider(rawOpts.provider);
				const keychain = opts?.keychainOverride ?? makeLiveKeychainAdapter();
				const kind: TokenKind = (rawOpts.kind as TokenKind | undefined) ?? defaultKindForProvider(provider);

				if (rawOpts.printBearer) {
					const bearer = await resolveBearerToken({ keychain, generate: false });
					if (!bearer) {
						console.error('mcp configure --print-bearer: no bearer in keychain (start the daemon at least once to auto-generate)');
						process.exit(1);
					}
					process.stdout.write(`${bearer}\n`);
					return;
				}

				if (rawOpts.revoke) {
					const removed = await deleteProviderToken(keychain, provider, kind);
					process.stdout.write(removed
						? `mcp configure --revoke: removed ${providerAccount(provider, kind)}\n`
						: `mcp configure --revoke: no entry for ${providerAccount(provider, kind)}\n`);
					return;
				}

				const token = await readTokenFromStdin(`Enter ${provider} ${kind} token: `);
				if (!token || token.length === 0) {
					console.error('mcp configure: empty token rejected');
					process.exit(1);
				}
				await setProviderToken(keychain, provider, kind, token);
				process.stdout.write(`mcp configure: stored ${providerAccount(provider, kind)} (${token.length} chars)\n`);
			} catch (e) {
				console.error(formatError(e, 'mcp configure failed'));
				process.exit(1);
			}
		});

	mcp.command('status')
		.description('Print per-provider state table from the running daemon')
		.action(async () => {
			try {
				const keychain = opts?.keychainOverride ?? makeLiveKeychainAdapter();
				const lock = readLockfile(resolveLockfilePath());
				if (!lock || !isPidAlive(lock.pid)) {
					console.error('mcp status: daemon not running (start an IDE bridge to launch the kernel daemon)');
					process.exit(1);
				}
				const states = await fetchProviderStates(lock, PROVIDERS);
				const tokenPresent = await Promise.all(PROVIDERS.map(async (p) => {
					const kind = defaultKindForProvider(p);
					const token = await getProviderToken(keychain, p, kind);
					return token !== null;
				}));
				const bearer = await keychain.getPassword(MCP_BEARER_SERVICE, KEYCHAIN_ACCOUNT_BEARER);
				const bearerFp = bearer ? sha256Fingerprint(bearer) : '<absent>';
				process.stdout.write(formatStatusTable(states, tokenPresent, bearerFp));
			} catch (e) {
				console.error(formatError(e, 'mcp status failed'));
				process.exit(1);
			}
		});

	mcp.command('doctor')
		.description('Preflight checks (keychain accessible + daemon reachable + tokens present)')
		.action(async () => {
			try {
				const keychain = opts?.keychainOverride ?? makeLiveKeychainAdapter();
				const checks: { name: string; ok: boolean; detail?: string }[] = [];

				// 1) Keychain access — write/read/delete on a sentinel account.
				const sentinelService = 'goatide.mcp.doctor';
				const sentinelAccount = `sentinel-${process.pid}-${Date.now()}`;
				try {
					await keychain.setPassword(sentinelService, sentinelAccount, 'sentinel-value');
					const got = await keychain.getPassword(sentinelService, sentinelAccount);
					await keychain.deletePassword(sentinelService, sentinelAccount);
					checks.push({ name: 'keychain.read_write_delete', ok: got === 'sentinel-value' });
				} catch (e) {
					checks.push({ name: 'keychain.read_write_delete', ok: false, detail: e instanceof Error ? e.message : String(e) });
				}

				// 2) Daemon reachable.
				const lock = readLockfile(resolveLockfilePath());
				const daemonAlive = !!lock && isPidAlive(lock.pid);
				checks.push({ name: 'daemon.reachable', ok: daemonAlive, detail: daemonAlive ? `pid=${lock!.pid} port=${lock!.rpc_port}` : 'lockfile missing or pid dead' });

				// 3) Per-provider token presence.
				for (const provider of PROVIDERS) {
					const kind = defaultKindForProvider(provider);
					const present = await getProviderToken(keychain, provider, kind);
					checks.push({ name: `token.${provider}`, ok: present !== null, detail: present === null ? `(run: goatide-cli mcp configure --provider ${provider})` : undefined });
				}

				const allOk = checks.every((c) => c.ok);
				const lines: string[] = [];
				lines.push('Doctor checks:');
				for (const c of checks) {
					const status = c.ok ? '✓' : '✗';
					const detail = c.detail ? ` — ${c.detail}` : '';
					lines.push(`  [${status}] ${c.name}${detail}`);
				}
				lines.push('');
				lines.push(allOk ? 'All green.' : 'One or more checks failed.');
				process.stdout.write(lines.join('\n') + '\n');
				if (!allOk) {
					process.exit(1);
				}
			} catch (e) {
				console.error(formatError(e, 'mcp doctor failed'));
				process.exit(1);
			}
		});
}

function parseProvider(raw: string): McpProviderNameWire {
	if (PROVIDERS.includes(raw as McpProviderNameWire)) {
		return raw as McpProviderNameWire;
	}
	throw new Error(`unknown provider: ${raw} (must be one of ${PROVIDERS.join(', ')})`);
}

/**
 * Read a single line from stdin. If TTY supports it we mute the input echo; otherwise the
 * prompt is shown and the line read normally (CI / scripted use).
 */
async function readTokenFromStdin(prompt: string): Promise<string> {
	process.stdout.write(prompt);
	const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
	return new Promise<string>((resolveLine) => {
		let resolved = false;
		const settle = (line: string): void => {
			if (resolved) {
				return;
			}
			resolved = true;
			try { rl.close(); } catch { /* best-effort */ }
			resolveLine(line.trim());
		};
		rl.on('line', (line) => settle(line));
		rl.on('close', () => settle(''));
	});
}

interface LockfileSummary {
	pid: number;
	rpc_port: number;
	auth_token: string;
}

async function fetchProviderStates(
	lock: LockfileSummary,
	providers: readonly McpProviderNameWire[],
): Promise<Map<McpProviderNameWire, McpProviderStateWire | 'unreachable'>> {
	const out = new Map<McpProviderNameWire, McpProviderStateWire | 'unreachable'>();
	const socket = await connectTcp(lock.rpc_port);
	try {
		const reader = new rpc.SocketMessageReader(socket);
		const writer = new rpc.SocketMessageWriter(socket);
		const connection = rpc.createMessageConnection(reader, writer);
		connection.listen();
		try {
			await connection.sendRequest(AuthenticateRequest, { token: lock.auth_token });
			for (const provider of providers) {
				try {
					const result = await connection.sendRequest(McpGetProviderStateRequest, { provider }) as McpGetProviderStateResult;
					out.set(provider, result.state);
				} catch {
					out.set(provider, 'unreachable');
				}
			}
		} finally {
			try { connection.dispose(); } catch { /* best-effort */ }
		}
	} finally {
		try { socket.destroy(); } catch { /* best-effort */ }
	}
	return out;
}

function connectTcp(port: number): Promise<net.Socket> {
	return new Promise<net.Socket>((resolveSocket, rejectSocket) => {
		const socket = net.createConnection({ host: '127.0.0.1', port }, () => resolveSocket(socket));
		socket.once('error', rejectSocket);
	});
}

function formatStatusTable(
	states: Map<McpProviderNameWire, McpProviderStateWire | 'unreachable'>,
	tokenPresent: boolean[],
	bearerFp: string,
): string {
	const headers = ['provider', 'state', 'token'];
	const rows: string[][] = [headers];
	let i = 0;
	for (const provider of PROVIDERS) {
		rows.push([provider, states.get(provider) ?? 'unreachable', tokenPresent[i] ? 'present' : '<absent>']);
		i++;
	}
	const widths = headers.map((h, idx) => {
		let max = h.length;
		for (const r of rows) {
			if (r[idx].length > max) {
				max = r[idx].length;
			}
		}
		return max;
	});
	const lines: string[] = [];
	lines.push(rows[0].map((c, idx) => c.padEnd(widths[idx])).join('  '));
	lines.push(widths.map((w) => '-'.repeat(w)).join('  '));
	for (let r = 1; r < rows.length; r++) {
		lines.push(rows[r].map((c, idx) => c.padEnd(widths[idx])).join('  '));
	}
	lines.push('');
	lines.push(`MCP bearer fingerprint: ${bearerFp}`);
	lines.push('  (use `goatide-cli mcp configure --provider <name> --print-bearer` to retrieve the full bearer)');
	return lines.join('\n') + '\n';
}
