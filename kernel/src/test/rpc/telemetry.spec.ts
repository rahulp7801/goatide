/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Wave-0 stub for CANV-09 — accept-latency telemetry.
// Plan 04-04 extends AttemptPayload Zod schema (Plan 04-02 lands the schema; 04-04 wires
// it into atomicAccept) with optional accept_latency_ms + tier fields.

import { describe, it } from 'vitest';

describe('CANV-09 — accept-latency telemetry on AttemptPayload', () => {
	it.skip('AttemptPayload accepts accept_latency_ms + tier fields — Plan 04-02 has not yet extended AttemptPayload Zod schema', () => {});
	it.skip('atomicAccept persists accept_latency_ms on the Attempt node — Plan 04-04 has not yet wired latency capture', () => {});
	it.skip('older Attempt nodes (without latency) parse successfully (backward compat) — Plan 04-02 has not yet defined optional fields', () => {});
});
