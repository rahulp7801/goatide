/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/rpc/index.ts — Phase 3 public surface for the JSON-RPC layer.
//
// kernel/src/main.ts (Plan 03-04) and the future bridge client (Phase 4) import from THIS
// file, never from `./server.js` or `./methods.js` directly. Mirrors the kernel/src/graph
// and kernel/src/receipt subsystem conventions.

export { createRpcServer, type CreateRpcServerArgs } from './server.js';
export {
	QueryGraphRequest,
	ProposeEditRequest,
	type QueryGraphParams,
	type QueryGraphResult,
	type ProposeEditParams,
	type ProposeEditResult,
} from './methods.js';
