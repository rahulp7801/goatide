/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/daemon/port-discovery.ts — Phase 5 (Plan 05-02) loopback TCP transport.
//
// Binds an ephemeral port on 127.0.0.1 (NEVER 0.0.0.0 — the daemon is localhost-only;
// exposing it to the LAN would defeat the per-daemon auth model). Per-socket
// MessageConnection wiring uses vscode-jsonrpc 8.2.1's StreamMessageReader/Writer pattern,
// matching the kernel's stdio path so handlers are framework-identical across transports.

import * as net from 'node:net';
import * as rpc from 'vscode-jsonrpc/node.js';

export interface BoundServer {
	server: net.Server;
	port: number;
}

/**
 * Bind net.Server to 127.0.0.1:0; resolve once the OS has assigned the ephemeral port.
 * Caller is responsible for installing connection handlers + closing the server on
 * shutdown.
 */
export function bindEphemeralPort(): Promise<BoundServer> {
	return new Promise((resolve, reject) => {
		const server = net.createServer();
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			server.removeListener('error', reject);
			const addr = server.address();
			if (addr === null || typeof addr !== 'object') {
				reject(new Error(`bindEphemeralPort: unexpected address type ${typeof addr}`));
				return;
			}
			resolve({ server, port: addr.port });
		});
	});
}

export type SocketConnectionHandler = (socket: net.Socket, connection: rpc.MessageConnection) => void;

/**
 * Wire net.Server's 'connection' event to per-socket vscode-jsonrpc MessageConnection
 * factories. The handler receives both the raw socket (for socket.destroy() on auth
 * failure) and the framed connection (for onRequest binding).
 */
export function createTcpRpcServer(server: net.Server, onConnection: SocketConnectionHandler): void {
	server.on('connection', (socket: net.Socket) => {
		const reader = new rpc.StreamMessageReader(socket);
		const writer = new rpc.StreamMessageWriter(socket);
		const connection = rpc.createMessageConnection(reader, writer);
		// Defensive cleanup: if the socket dies mid-request, dispose the framed connection
		// so handlers don't leak listeners + the writer doesn't try to push bytes onto a
		// closed half-duplex.
		socket.once('error', () => { try { connection.dispose(); } catch { /* best-effort */ } });
		socket.once('close', () => { try { connection.dispose(); } catch { /* best-effort */ } });
		onConnection(socket, connection);
	});
}
