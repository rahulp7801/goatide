/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/rpc/methods.ts — Phase 3 (Plan 03-04) typed JSON-RPC RequestType definitions.
//
// Per 03-RESEARCH.md ## Code Examples — RequestType Definitions. Both the kernel server
// and the (Phase-4) bridge client import from this module so the wire contract is
// strictly typed end-to-end.
//
// vscode-jsonrpc 8.2.1 (NOT 9.x — see Plan 03-01 SUMMARY for the version-pin rationale)
// exposes RequestType from both the package root and 'vscode-jsonrpc/node'. We import
// from 'vscode-jsonrpc' (the common surface) so this module is reusable from a future
// browser/IPC client too.

import { RequestType } from 'vscode-jsonrpc';
import type { AnchorRequest } from '../graph/anchor.js';
import type { Scope, TraverseRow } from '../graph/traverse.js';
import type { ReasoningReceipt } from '../receipt/index.js';

// -------- graph.queryGraph --------

export interface QueryGraphParams {
	anchor: AnchorRequest;
	scope?: Scope;          // default 'all'
	max_hops?: number;      // default 4 (TRAV-02)
	at?: string;            // default new Date().toISOString() (TRAV-03)
}

export interface QueryGraphResult {
	nodes: TraverseRow[];
	paths: string[];
}

export const QueryGraphRequest = new RequestType<QueryGraphParams, QueryGraphResult, Error>('graph.queryGraph');

// -------- graph.proposeEdit --------

export interface ProposeEditParams {
	diff: string;
	destructive: boolean;
	asOf?: string;
}

export interface ProposeEditResult {
	receipt: ReasoningReceipt;
}

export const ProposeEditRequest = new RequestType<ProposeEditParams, ProposeEditResult, Error>('graph.proposeEdit');
