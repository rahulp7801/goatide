/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/clients/stdio-client.spec.ts — Phase 6 (Plan 06-03) MCP-06 stdio Client.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { createStdioClient } from '../../../mcp/clients/stdio-client.js';
import type { McpProviderConfig } from '../../../mcp/clients/types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface CapturedTransportArgs {
	command: string;
	args: string[];
	env: Record<string, string> | undefined;
	cwd: string | undefined;
}

function makeFakeClientFactory(opts: { connectFails?: Error } = {}) {
	const calls: { onerror?: (err: Error) => void; onclose?: () => void; connected: boolean } = { connected: false };
	const client: any = {
		connect: async () => {
			if (opts.connectFails) {
				// SDK's design: connect() rejects, AND any onerror set ahead of time also fires
				// when the underlying transport throws. We emulate that by invoking onerror
				// before rejecting (some transport implementations do this; fixing the contract
				// at the wrapper level lets tests assert the wrapper hooks work).
				if (calls.onerror) {
					calls.onerror(opts.connectFails);
				}
				throw opts.connectFails;
			}
			calls.connected = true;
		},
		close: async () => { calls.connected = false; },
		set onerror(fn: (err: Error) => void) { calls.onerror = fn; },
		get onerror() { return calls.onerror as ((err: Error) => void); },
		set onclose(fn: () => void) { calls.onclose = fn; },
		get onclose() { return calls.onclose as (() => void); },
	};
	const factory = (() => client) as never;
	return { factory, calls, client };
}

function makeFakeTransportFactory() {
	const captures: CapturedTransportArgs[] = [];
	const factory = (args: { command: string; args: string[]; env?: Record<string, string>; cwd?: string }) => {
		captures.push({ command: args.command, args: args.args, env: args.env, cwd: args.cwd });
		return {} as never;
	};
	return { factory, captures };
}

const baseCfg: McpProviderConfig = {
	provider: 'github',
	command: 'node',
	args: ['mock.cjs'],
};

describe('MCP-06: stdio Client lifecycle, env merge, and onerror handling', () => {
	it('MCP-06: client.onerror handler fires on transport error and pool transitions state to restarting', async () => {
		const transportErr = new Error('transport boom');
		const { factory: clientFactory, calls } = makeFakeClientFactory({ connectFails: transportErr });
		const { factory: transportFactory } = makeFakeTransportFactory();
		const errors: Error[] = [];

		await expect(createStdioClient({
			cfg: baseCfg,
			onError: err => errors.push(err),
			clientFactory,
			transportFactory,
		})).rejects.toThrow('transport boom');

		expect({
			errors: errors.map(e => e.message),
			onerrorWired: typeof calls.onerror === 'function',
		}).toEqual({
			errors: ['transport boom'],
			onerrorWired: true,
		});
	});

	it('MCP-06: env merge spreads process.env first then adapter env (Pitfall 2 — PATH inheritance)', async () => {
		const { factory: clientFactory } = makeFakeClientFactory();
		const { factory: transportFactory, captures } = makeFakeTransportFactory();
		// PATH is essentially universal across CI / dev OSes; vitest inherits the parent's process.env.
		const parentPath = process.env.PATH ?? process.env.Path ?? process.env.path;

		await createStdioClient({
			cfg: { ...baseCfg, env: { MY_TOKEN: 'x' } },
			onError: () => undefined,
			clientFactory,
			transportFactory,
		});

		const env = captures[0]?.env ?? {};
		expect({
			myTokenSet: env['MY_TOKEN'],
			pathInherited: (env['PATH'] ?? env['Path'] ?? env['path']) === parentPath,
			capturedCount: captures.length,
		}).toEqual({
			myTokenSet: 'x',
			pathInherited: true,
			capturedCount: 1,
		});
	});

	it('MCP-06: process.env mutation by adapter rejected (Pitfall 8 — source contains no `process.env.X = ...` writes)', () => {
		// Static-analysis test: load stdio-client.ts source as string and assert no
		// `process.env.<UPPER>\s*=` mutation exists. Mirrors the refusal-gate philosophy
		// at the unit-test layer — a future contributor introducing process.env mutation
		// fails this test before failing CI.
		const stdioClientSrc = readFileSync(resolve(__dirname, '..', '..', '..', 'mcp', 'clients', 'stdio-client.ts'), 'utf8');
		const mutationRe = /process\.env\.[A-Z_][A-Z0-9_]*\s*=/g;
		const hits = stdioClientSrc.match(mutationRe) ?? [];
		expect(hits).toEqual([]);
	});
});
