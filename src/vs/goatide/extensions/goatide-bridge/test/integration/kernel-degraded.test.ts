/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Wave-0 stub for CANV-10 — kernel-degraded mode.
// Plan 04-05 implements: connection-state machine, status-bar banner, pending-attempts
// JSONL queue, destructive-block under degraded, reconnect+drain.

import { describe, it } from 'mocha';

describe('CANV-10 — kernel-degraded banner + bypass + block', () => {
	it.skip('status-bar banner appears within 30s of missed heartbeat — Plan 04-05 has not yet implemented connection-state', () => {
		// Stub. Plan 04-05.
	});
	it.skip('non-destructive save under degraded writes file + appends pending-attempts.jsonl — Plan 04-05 has not yet implemented degraded-bypass path', () => {
		// Stub. Plan 04-05.
	});
	it.skip('destructive save under degraded shows error message + leaves doc dirty — Plan 04-05 has not yet implemented degraded-block path', () => {
		// Stub. Plan 04-05.
	});
	it.skip('reconnect drains pending-attempts.jsonl into the kernel graph — Plan 04-05 has not yet implemented drain', () => {
		// Stub. Plan 04-05.
	});
});
