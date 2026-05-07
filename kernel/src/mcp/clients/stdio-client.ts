/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/clients/stdio-client.ts — Phase 6 (Plan 06-03) per-provider Client wrapper.
//
// Encapsulates the Client + StdioClientTransport pair for a single provider. The pool calls
// createStdioClient(args) per provider in its startProvider() supervision loop; this module
// owns:
//
//  1. Pitfall 2 defense: env merge spreads `...process.env` FIRST then `...cfg.env`.
//     Failing to inherit PATH would break the spawned child (npm package binaries can't
//     resolve their own runtime).
//  2. Pitfall 8 defense: this file MUST NOT contain ANY `process.env.<UPPER> = ...` mutation.
//     A unit test in stdio-client.spec.ts greps this source file and fails on any match.
//  3. onerror / onclose wiring: SDK Client emits transport-level errors via these handlers;
//     pool's handleError() callback is wired here.
//  4. Factory injection: clientFactory + transportFactory are overridable so tests can
//     drive the wrapper without spawning a real child process.

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

import type { McpProviderConfig } from './types.js';

export interface StdioClientHandle {
	client: Client;
	transport: StdioClientTransport;
}

interface ClientInfo {
	name: string;
	version: string;
}

interface StdioConstructorArgs {
	command: string;
	args: string[];
	env?: Record<string, string>;
	cwd?: string;
}

export interface CreateStdioClientArgs {
	cfg: McpProviderConfig;
	onError: (err: Error) => void;
	onClose?: () => void;
	/** Test injection point; production uses default new Client(). */
	clientFactory?: (info: ClientInfo) => Client;
	/** Test injection point; production uses default new StdioClientTransport(). */
	transportFactory?: (args: StdioConstructorArgs) => StdioClientTransport;
}

const DEFAULT_CLIENT_INFO: ClientInfo = { name: 'goatide-kernel', version: '0.0.1' };

function defaultClientFactory(info: ClientInfo): Client {
	// Empty capabilities — we only call tools/list and tools/call. The SDK's defaults are
	// permissive enough that we don't need to advertise any client-side capabilities for
	// the consume-side flow.
	return new Client(info, { capabilities: {} });
}

function defaultTransportFactory(args: StdioConstructorArgs): StdioClientTransport {
	return new StdioClientTransport(args);
}

/**
 * Construct + connect a stdio MCP client for one provider. Returns the connected handle.
 * Throws if Client.connect() rejects; callers (the pool) wrap this in runWithBackoff.
 */
export async function createStdioClient(args: CreateStdioClientArgs): Promise<StdioClientHandle> {
	// Pitfall 2: PATH inheritance. Spread process.env FIRST so cfg.env can override but
	// the child's PATH (and other essential vars like SystemRoot on Windows) survive.
	const mergedEnv: Record<string, string> = {};
	for (const [k, v] of Object.entries(process.env)) {
		if (typeof v === 'string') {
			mergedEnv[k] = v;
		}
	}
	if (args.cfg.env) {
		for (const [k, v] of Object.entries(args.cfg.env)) {
			mergedEnv[k] = v;
		}
	}

	const transport = (args.transportFactory ?? defaultTransportFactory)({
		command: args.cfg.command,
		args: args.cfg.args,
		env: mergedEnv,
		cwd: args.cfg.cwd,
	});

	const client = (args.clientFactory ?? defaultClientFactory)(DEFAULT_CLIENT_INFO);
	client.onerror = args.onError;
	if (args.onClose) {
		client.onclose = args.onClose;
	}

	await client.connect(transport);
	return { client, transport };
}
