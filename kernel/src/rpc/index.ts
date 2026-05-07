/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/rpc/index.ts — Phase 3 + Phase 4 (Plan 04-04) public surface for the
// JSON-RPC layer.
//
// kernel/src/main.ts (Plan 03-04) and the Phase-4 bridge client (Plan 04-05) import from
// THIS file, never from `./server.js` or `./methods.js` directly. Mirrors the
// kernel/src/graph and kernel/src/receipt subsystem conventions.

export { createRpcServer, type CreateRpcServerArgs } from './server.js';
export {
	QueryGraphRequest,
	ProposeEditRequest,
	RecordRejectionRequest,
	AtomicAcceptRequest,
	QueryAttemptByStagingPathRequest,
	QueryNodesRequest,
	HeartbeatRequest,
	AuthenticateRequest,
	type QueryGraphParams,
	type QueryGraphResult,
	type ProposeEditParams,
	type ProposeEditResult,
	type RecordRejectionParams,
	type RecordRejectionResult,
	type AtomicAcceptParams,
	type AtomicAcceptResult,
	type QueryAttemptByStagingPathParams,
	type QueryAttemptByStagingPathResult,
	type QueryNodesParams,
	type QueryNodesResult,
	type HeartbeatParams,
	type HeartbeatResult,
	type AuthenticateParams,
	type AuthenticateResult,
} from './methods.js';
