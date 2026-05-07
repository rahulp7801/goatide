/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/server/http-server.ts — Phase 6 (Plan 06-02) Streamable HTTP MCP server.
//
// MCP-08 substrate: external Claude-Code CLI sessions connect to http://127.0.0.1:7345/mcp
// with Authorization: Bearer <token> + Origin: http://127.0.0.1:7345. Two-layer middleware:
//
//   1. Origin allowlist (Pitfall 1 — substring-match defense). Set<string> exact-equality
//      lookup against a 6-entry allowlist:
//          [http://localhost, http://localhost:7345, http://127.0.0.1, http://127.0.0.1:7345,
//           http://[::1], http://[::1]:7345]
//      This rejects http://localhost.evil.com (DNS rebinding / subdomain takeover attacks).
//
//   2. Bearer-token gate (Pitfall 3 — timing leak / log leak defense). validateBearerToken
//      uses crypto.timingSafeEqual; logs only sha256Fingerprint(token).
//
// CONSTITUTIONAL PIN: app.listen receives the LITERAL string 127.0.0.1 — never any-interface
// IPv4, never any-interface IPv6, never the DNS-ambiguous "localhost" alias. The CI gate
// scripts/ci/refuse-non-loopback-mcp-bind.sh enforces this by static-grep against
// kernel/src/mcp/server/.

import express, { type Request, type Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { Server } from 'node:http';
import { createMcpTransport } from './transport.js';
import { sha256Fingerprint, validateBearerToken } from './auth.js';

export const MCP_DEFAULT_PORT = 7345;

export interface StartMcpServerArgs {
	/**
	 * Port to bind. Defaults to MCP_DEFAULT_PORT (7345). Tests pass 0 to bind an ephemeral
	 * port (use allocateLoopbackPort from kernel/src/test/helpers/mcp-fixtures.ts to
	 * pre-reserve and discover the port for parallel runs).
	 */
	port?: number;
	/** Bearer token resolved from keychain (see resolveBearerToken in ./auth.ts). */
	bearerToken: string;
	/** Tool registration callback — wires graph.* tools onto the McpServer. */
	registerTools: (server: McpServer) => void;
}

export interface McpServerHandle {
	/** Actual port bound (may differ from requested if port=0). */
	port: number;
	/** SHA-256 prefix of the bearer token (8 hex chars) for log audit cross-reference. */
	bearerFingerprint: string;
	/** Graceful shutdown — closes transport then http server. */
	close: () => Promise<void>;
}

const ALLOWED_ORIGIN_BASES: ReadonlyArray<string> = [
	'http://localhost',
	'http://127.0.0.1',
	'http://[::1]',
];

function buildAllowedOrigins(port: number): Set<string> {
	const set = new Set<string>(ALLOWED_ORIGIN_BASES);
	for (const base of ALLOWED_ORIGIN_BASES) {
		set.add(`${base}:${port}`);
	}
	// Also accept the constitutional default port for clients hard-coded to 7345 even when
	// tests bind an ephemeral port — keeps the allowlist permissive for the constitutional
	// case while never weakening exact-equality enforcement.
	if (port !== MCP_DEFAULT_PORT) {
		for (const base of ALLOWED_ORIGIN_BASES) {
			set.add(`${base}:${MCP_DEFAULT_PORT}`);
		}
	}
	return set;
}

/**
 * Start the loopback MCP HTTP server. Binds 127.0.0.1 LITERALLY (refuse-non-loopback gate).
 * Wires Origin allowlist + bearer-token middleware in front of the StreamableHTTPServerTransport.
 */
export async function startMcpServer(args: StartMcpServerArgs): Promise<McpServerHandle> {
	const requestedPort = args.port ?? MCP_DEFAULT_PORT;
	const fingerprint = sha256Fingerprint(args.bearerToken);

	const app = express();
	app.use(express.json());

	// 1. Origin allowlist (Pitfall 1). The Origin header is browser-set on cross-origin
	//    requests and is the standard signal for DNS-rebinding / subdomain attacks. We
	//    reject any non-empty Origin not in the exact-match Set. Missing Origin is allowed
	//    (CLI / non-browser clients don't send Origin). The allowlist is built per-listen
	//    so the actual-port variant is included after we know what port we got.
	let allowedOrigins: Set<string> = buildAllowedOrigins(requestedPort);
	app.use((req, res, next) => {
		const origin = req.header('Origin');
		if (origin && !allowedOrigins.has(origin)) {
			res.status(403).json({ error: 'origin_not_allowed', received: origin });
			return;
		}
		next();
	});

	// 2. Bearer-token gate (Pitfall 3). Constant-time compare via timingSafeEqual; logs only
	//    the SHA-256 fingerprint, never the token itself.
	app.use((req, res, next) => {
		const auth = req.header('Authorization');
		if (!auth || !auth.startsWith('Bearer ')) {
			res.status(401).json({ error: 'missing_bearer' });
			return;
		}
		const presented = auth.slice('Bearer '.length);
		if (!validateBearerToken(presented, args.bearerToken)) {
			res.status(401).json({ error: 'invalid_bearer' });
			return;
		}
		next();
	});

	// 3. MCP server + tool registration + Streamable HTTP transport.
	const server = new McpServer({ name: 'goatide-graph', version: '0.0.1' });
	args.registerTools(server);
	const transport = await createMcpTransport(server);

	// 4. Single /mcp endpoint, both POST + GET (per MCP spec 2025-06-18 § Sending Messages).
	app.all('/mcp', async (req: Request, res: Response) => {
		try {
			await transport.handleRequest(req, res, req.body);
		} catch (e) {
			if (!res.headersSent) {
				res.status(500).json({ error: 'transport_error' });
			}
		}
	});

	// 5. CONSTITUTIONAL PIN: bind 127.0.0.1 LITERAL — never any-interface, never the DNS
	//    alias. refuse-non-loopback-mcp-bind.sh enforces this constraint via static grep.
	const httpServer = await new Promise<Server>((resolve, reject) => {
		const s = app.listen(requestedPort, '127.0.0.1', () => resolve(s));
		s.on('error', reject);
	});

	const addr = httpServer.address();
	const actualPort = (addr && typeof addr === 'object') ? addr.port : requestedPort;

	// Rebuild the allowlist with the actual port if the caller requested ephemeral (port=0)
	// or got a different port than requested.
	if (actualPort !== requestedPort) {
		allowedOrigins = buildAllowedOrigins(actualPort);
	}

	console.error(`[mcp] listening on 127.0.0.1:${actualPort} bearer_fp=${fingerprint}`);

	return {
		port: actualPort,
		bearerFingerprint: fingerprint,
		close: async () => {
			try {
				await transport.close();
			} catch {
				// best-effort
			}
			await new Promise<void>((resolve, reject) => {
				httpServer.close((err) => (err ? reject(err) : resolve()));
			});
		},
	};
}
