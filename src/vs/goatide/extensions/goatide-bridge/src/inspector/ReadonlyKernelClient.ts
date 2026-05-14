/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/inspector/ReadonlyKernelClient.ts —
// Phase 14 Plan 14-01 (Wave-0) DEEP-05 + DEEP-01 read-side type narrowing.
//
// This is a TYPE-ONLY file. After tsc emits, the corresponding .js MUST be empty (or
// contain only the `export {}` ESM marker). The CI gate scripts/ci/refuse-deep05-write.sh
// structurally fences the inspector/ directory against importing any of the four banned
// write-RPC method names (see the gate script for the canonical token list) so the
// read-only contract cannot drift.
//
// Wave-0 minimal Pick<>: the methods named below are precisely those that exist on
// KernelClient as of 2026-05-13. queryRationaleAt is NOT in the Pick<>; Plan 14-02 Task 2
// adds it to KernelClient AND extends this Pick<> simultaneously (I1 fix — keeps the
// Wave-0 type structurally complete so tsc --noEmit passes today).
//
// Mandate-B fence (Pitfall 7): we use `import type` so no runtime symbol from KernelClient
// (notably the four banned methods) appears in the emitted .js. The unit test asserts the
// emitted .js contains zero runtime exports.

import type { KernelClient } from '../kernel/client.js';

/**
 * Read-only narrowing of `KernelClient` for the DEEP-05 session-priority lens + the DEEP-01
 * "Why does this exist?" rationale-chain webview component.
 *
 * Banned methods (DEEP-05 Mandate B + DEEP-04 Mandate D): the four write RPCs whose names
 * are enumerated as the `BANNED` token array in `scripts/ci/refuse-deep05-write.sh`. The
 * gate grep-fences `inspector/` against any TS file containing those identifiers — even
 * in a comment, even as a string literal — so this type is the *contract*, the gate is
 * the *enforcement*.
 *
 * Wave-0 (Plan 14-01): omits `queryRationaleAt`. Plan 14-02 Task 2 lands `queryRationaleAt`
 * on `KernelClient` AND extends this Pick<> to include it. Doing the two together keeps the
 * type structurally valid at every step (no "method does not exist on KernelClient" errors).
 */
export type ReadonlyKernelClient = Pick<KernelClient,
	'queryGraph' | 'queryNodes' | 'heartbeat' | 'runDriftAndLock'
	| 'onDidChangeState' | 'onDriftProgress' | 'isConnected' | 'currentState'>;
