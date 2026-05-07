/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/index.ts — Phase 6 (Plan 06-02) public surface for the MCP module.
//
// Mirrors kernel/src/graph/index.ts and kernel/src/receipt/index.ts: every caller above
// the MCP layer (daemon entrypoint, future bridge MCP-06/07 surfaces) imports from THIS
// file — never from `./server/*` directly. The daemon only needs `startMcpServer` plus
// `resolveBearerToken` for boot-time keychain resolution.

export {
	startMcpServer,
	MCP_DEFAULT_PORT,
	type StartMcpServerArgs,
	type McpServerHandle,
} from './server/http-server.js';
export {
	resolveBearerToken,
	validateBearerToken,
	sha256Fingerprint,
	type KeychainAdapter,
	KEYCHAIN_SERVICE,
	KEYCHAIN_ACCOUNT_BEARER,
} from './server/auth.js';
export { createMcpTransport } from './server/transport.js';
export { registerGraphTools, type GraphToolDeps } from './server/tools/index.js';
