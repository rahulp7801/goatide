/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/daemon/auth-token.ts — Phase 5 (Plan 05-02) per-daemon auth-token gate.
//
// Loopback-only TCP transport doesn't strictly require auth (any process running as the
// same user can already access the lockfile + bind a connecting socket), but a per-daemon
// 32-byte secret cheaply defeats two threat models:
//   (a) accidental cross-IDE crosstalk — two GoatIDE installs on one machine never see
//       each other's daemons because their tokens differ;
//   (b) timing-side-channel oracles probing 'is there a daemon listening?' — token check
//       is constant-time so no information leaks.
// Phase 6 MCP-09 inherits this gate; it's introduced one phase early to amortise rollout.

import { randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Generate a fresh 256-bit auth token, hex-encoded (64 hex chars). Each call returns a
 * cryptographically-distinct value; collision probability is 2^-256.
 */
export function generateAuthToken(): string {
	return randomBytes(32).toString('hex');
}

/**
 * Constant-time compare two tokens. Returns false on length mismatch (timingSafeEqual
 * throws RangeError on mismatched lengths; we wrap in try/catch + length check so a
 * truncated attacker probe can't distinguish 'wrong length' from 'wrong content').
 */
export function validateAuthToken(presented: string, expected: string): boolean {
	if (typeof presented !== 'string' || presented.length !== expected.length) {
		return false;
	}
	try {
		return timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
	} catch {
		return false;
	}
}
