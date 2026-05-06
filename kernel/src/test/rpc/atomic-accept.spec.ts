/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Wave-0 stub for CANV-07 — atomic accept RPC.
// Plan 04-04 implements graph.atomicAccept handler that runs ONE DB transaction
// inserting the Attempt node + 'references' edge to the receipt's first cited node.
// File-write coordination (stage+rename+parent-fsync) lives bridge-side; kernel
// only owns the DB-side atomicity.

import { describe, it } from 'vitest';

describe('CANV-07 — atomic accept RPC', () => {
	it.skip('atomicAccept inserts Attempt + references edge in one transaction — Plan 04-04 has not yet implemented atomicAccept', () => {});
	it.skip('atomicAccept rolls back if Attempt insert violates Ghosting (Zod) — Plan 04-04 has not yet implemented input validation', () => {});
	it.skip('atomicAccept persists tier + accept_latency_ms in payload — Plan 04-04 has not yet implemented payload extension wiring', () => {});
	it.skip('atomicAccept returns the new Attempt node id — Plan 04-04 has not yet defined response shape', () => {});
});
