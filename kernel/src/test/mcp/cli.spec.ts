/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/cli.spec.ts — Phase 6 (Plan 06-06) MCP-03 + MCP-06 + MCP-09 CLI tests.
//
// Drives the registerMcpCommands surface in-process via the same commander parent + the
// makeKeychainMock in-memory keychain so the host OS keychain is never touched. Avoids a
// spawnSync round-trip (the readline stdin path + bidirectional TCP RPC inside spawnSync
// adds determinism + Windows pipe-handling complications) — the same surface area is
// exercised by injecting the keychainOverride and mocking process.argv.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, GraphDAO } from '../../graph/index.js';
import { ReceiptDAO } from '../../receipt/index.js';
import { startDaemon, type DaemonHandle } from '../../daemon/index.js';
import { registerMcpCommands } from '../../cli/commands/mcp.js';
import { makeKeychainMock } from '../helpers/mcp-fixtures.js';
import { getProviderToken, providerAccount } from '../../mcp/auth/keychain.js';

/**
 * Run a single `goatide-cli mcp <subcommand> ...` invocation in-process. process.exit calls
 * inside the action handler are caught + re-thrown as a synthetic error so vitest can assert
 * exit codes. process.stdout.write is captured so the table output can be inspected.
 */
async function runMcpCli(args: string[], opts: { keychain?: ReturnType<typeof makeKeychainMock>; stdinLine?: string } = {}): Promise<{ stdout: string; stderr: string; exitCode: number }> {
	const stdoutChunks: string[] = [];
	const stderrChunks: string[] = [];
	const origStdoutWrite = process.stdout.write.bind(process.stdout);
	const origStderrWrite = process.stderr.write.bind(process.stderr);
	const origExit = process.exit.bind(process);
	let capturedExit = 0;

	(process.stdout.write as unknown as (chunk: string | Uint8Array) => boolean) = ((chunk: string | Uint8Array): boolean => {
		stdoutChunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
		return true;
	}) as typeof process.stdout.write;
	(process.stderr.write as unknown as (chunk: string | Uint8Array) => boolean) = ((chunk: string | Uint8Array): boolean => {
		stderrChunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
		return true;
	}) as typeof process.stderr.write;
	const exitSpy: typeof process.exit = ((code?: number): never => {
		capturedExit = code ?? 0;
		throw new Error(`__cli_exit_${capturedExit}__`);
	}) as typeof process.exit;
	(process as unknown as { exit: typeof process.exit }).exit = exitSpy;

	// Pipe stdinLine into readline by overriding stdin if needed. The simplest hermetic
	// approach is to stub process.stdin.on('line') via a fake readline interface — but
	// readline.createInterface reads from the supplied input stream directly. We replace
	// process.stdin with a minimal Readable carrying the line.
	let restoreStdin: (() => void) | undefined;
	if (opts.stdinLine !== undefined) {
		const { PassThrough } = await import('node:stream');
		const fakeStdin = new PassThrough();
		// Defer the write to the next tick so readline has a chance to subscribe before
		// the data arrives. PassThrough buffers internally so the readline 'line' event
		// fires deterministically even though we don't call .end() immediately.
		const stdinLine = opts.stdinLine;
		setImmediate(() => {
			fakeStdin.write(`${stdinLine}\n`);
			fakeStdin.end();
		});
		const origStdin = process.stdin;
		Object.defineProperty(process, 'stdin', { value: fakeStdin as unknown as NodeJS.ReadStream, configurable: true });
		restoreStdin = () => Object.defineProperty(process, 'stdin', { value: origStdin, configurable: true });
	}

	const program = new Command();
	program.name('goatide-cli').exitOverride();
	registerMcpCommands(program, opts.keychain ? { keychainOverride: opts.keychain } : undefined);
	try {
		await program.parseAsync(['node', 'goatide-cli', ...args]);
	} catch (e) {
		const msg = e instanceof Error ? e.message : String(e);
		if (!msg.startsWith('__cli_exit_')) {
			stderrChunks.push(`THROW: ${msg}\n`);
			capturedExit = 1;
		}
	} finally {
		(process.stdout.write as unknown as typeof origStdoutWrite) = origStdoutWrite;
		(process.stderr.write as unknown as typeof origStderrWrite) = origStderrWrite;
		(process as unknown as { exit: typeof process.exit }).exit = origExit;
		if (restoreStdin) {
			restoreStdin();
		}
	}
	return {
		stdout: stdoutChunks.join(''),
		stderr: stderrChunks.join(''),
		exitCode: capturedExit,
	};
}

describe('MCP-03 + MCP-06: goatide-cli mcp subcommands (configure + status)', () => {
	it('MCP-03: goatide-cli mcp configure --provider slack writes token to keychain via keytar', async () => {
		const keychain = makeKeychainMock();
		const out = await runMcpCli(
			['mcp', 'configure', '--provider', 'slack'],
			{ keychain, stdinLine: 'xoxp-test-slack-token-1234' },
		);
		const account = providerAccount('slack', 'access');
		const stored = await getProviderToken(keychain, 'slack', 'access');

		expect({
			exit: out.exitCode,
			stdoutContainsAccount: out.stdout.includes(account),
			storedExactlyMatches: stored === 'xoxp-test-slack-token-1234',
		}).toEqual({
			exit: 0,
			stdoutContainsAccount: true,
			storedExactlyMatches: true,
		});
	});

	it('MCP-06: goatide-cli mcp status prints per-provider state table reading from mcp.getProviderState RPC', async () => {
		// Spin up a real daemon so the status command can authenticate + walk the
		// mcp.getProviderState RPC for each of the 4 providers. mcpClientPool is null
		// (no provider configs in env) so every getProviderState returns 'closed'.
		const tmp = mkdtempSync(join(tmpdir(), 'goatide-mcp-cli-'));
		const dbPath = join(tmp, 'graph.db');
		const lockfilePath = join(tmp, 'kernel.lock');
		const dbHandle = openDatabase(dbPath);
		const dao = new GraphDAO(dbHandle.db);
		const receiptDao = new ReceiptDAO(dbHandle.db);
		// Override the lockfile resolution so the CLI reads from the same path the daemon writes.
		const origConfigDir = process.env.XDG_CONFIG_HOME;
		const origAppData = process.env.APPDATA;
		process.env.XDG_CONFIG_HOME = tmp;
		process.env.APPDATA = tmp;
		// resolveLockfilePath() honors XDG_CONFIG_HOME / APPDATA; prepare the goatide subdir.
		const { mkdirSync } = await import('node:fs');
		mkdirSync(join(tmp, 'goatide'), { recursive: true });
		const lockfileForCli = join(tmp, 'goatide', 'kernel.lock');

		let handle: DaemonHandle | null = null;
		try {
			handle = await startDaemon({
				dao,
				receiptDao,
				sqlite: dbHandle.sqlite,
				dbPath,
				version: '0.0.1-test',
				lockfilePath: lockfileForCli,
				claudeJsonlWatchPaths: null,
				mcp: null,
			});

			const keychain = makeKeychainMock();
			const out = await runMcpCli(['mcp', 'status'], { keychain });

			expect({
				exit: out.exitCode,
				stdoutHasHeader: /provider\s+state\s+token/.test(out.stdout),
				stdoutHasGithub: /github/.test(out.stdout),
				stdoutHasSlack: /slack/.test(out.stdout),
				stdoutHasLinear: /linear/.test(out.stdout),
				stdoutHasJira: /jira/.test(out.stdout),
				stdoutHasFingerprintLine: /MCP bearer fingerprint:/.test(out.stdout),
			}).toEqual({
				exit: 0,
				stdoutHasHeader: true,
				stdoutHasGithub: true,
				stdoutHasSlack: true,
				stdoutHasLinear: true,
				stdoutHasJira: true,
				stdoutHasFingerprintLine: true,
			});
		} finally {
			if (handle) {
				await handle.close();
			}
			try { dbHandle.close(); } catch { /* best-effort */ }
			if (origConfigDir === undefined) {
				delete process.env.XDG_CONFIG_HOME;
			} else {
				process.env.XDG_CONFIG_HOME = origConfigDir;
			}
			if (origAppData === undefined) {
				delete process.env.APPDATA;
			} else {
				process.env.APPDATA = origAppData;
			}
			try { rmSync(tmp, { recursive: true, force: true }); } catch { /* best-effort */ }
		}
	});

	it('MCP-06: configure --revoke removes existing keychain entry', async () => {
		const keychain = makeKeychainMock();
		await keychain.setPassword('goatide.mcp', providerAccount('github', 'api'), 'gho_existing_token');

		const out = await runMcpCli(
			['mcp', 'configure', '--provider', 'github', '--revoke'],
			{ keychain },
		);
		const remaining = await getProviderToken(keychain, 'github', 'api');

		expect({ exit: out.exitCode, removed: out.stdout.includes('removed'), remaining }).toEqual({
			exit: 0,
			removed: true,
			remaining: null,
		});
	});
});
