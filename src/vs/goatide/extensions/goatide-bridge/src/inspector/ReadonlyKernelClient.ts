/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/inspector/ReadonlyKernelClient.ts —
// Phase 14 Plan 14-01 (Wave-0) + Plan 14-02 (Wave-1) DEEP-05 + DEEP-01 read-side type
// narrowing.
//
// This is a TYPE-ONLY file. After tsc emits, the corresponding .js MUST be empty (or
// contain only the `export {}` ESM marker). The CI gate scripts/ci/refuse-deep05-write.sh
// structurally fences the inspector/ directory against importing any of the four banned
// write-RPC method names (see the gate script for the canonical token list) so the
// read-only contract cannot drift.
//
// Plan 14-02 (I1 wave-split): the Pick<> gains `'queryRationaleAt'` atomically with the
// KernelClient.queryRationaleAt method landing in the same task/commit. The two changes
// together keep the bridge tsc gate GREEN across the Wave-0 → Wave-1 transition.
//
// Mandate-B fence (Pitfall 7): we use `import type` so no runtime symbol from KernelClient
// (notably the four banned methods) appears in the emitted .js. The unit test asserts the
// emitted .js contains zero runtime exports.

import type { KernelClient } from '../kernel/client.js';

/**
 * Read-only narrowing of `KernelClient` for the DEEP-05 session-priority lens + the DEEP-01
 * "Why does this exist?" rationale-chain webview component + the DEEP-02 Graph Inspector.
 *
 * Banned methods (DEEP-05 Mandate B + DEEP-04 Mandate D): the four write RPCs whose names
 * are enumerated as the `BANNED` token array in `scripts/ci/refuse-deep05-write.sh`. The
 * gate grep-fences `inspector/` against any TS file containing those identifiers — even
 * in a comment, even as a string literal — so this type is the *contract*, the gate is
 * the *enforcement*.
 *
 * Plan 14-02 includes `queryRationaleAt` in the Pick<> (DEEP-01 read-side method landed on
 * KernelClient in the same task). Plan 14-04 (DEEP-05) consumes this surface from
 * inspector/session-priority-lens.ts; downstream session-priority-lens code can call
 * `client.queryRationaleAt(...)` for read-only enrichment without breaking Mandate-B.
 *
 * Plan 15-01 (Phase 15 Wave-0) adds `queryGraphSnapshot` + `queryTimelineTransitions` to
 * the Pick<>. The two methods land on KernelClient as throw-stubs in Plan 15-01 Task 5;
 * Plan 15-02 (Wave 1) replaces the throw-stubs with real RPC bodies + server-side handler
 * registration. Plan 15-04 (Wave 3) consumes both via this surface from the Graph Inspector
 * webview-side adapter.
 */
export type ReadonlyKernelClient = Pick<KernelClient,
	'queryGraph' | 'queryNodes' | 'queryRationaleAt'
	| 'queryGraphSnapshot' | 'queryTimelineTransitions'
	| 'heartbeat' | 'runDriftAndLock'
	| 'onDidChangeState' | 'onDriftProgress' | 'isConnected' | 'currentState'>;
