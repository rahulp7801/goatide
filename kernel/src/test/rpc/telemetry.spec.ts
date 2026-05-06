/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/rpc/telemetry.spec.ts — Plan 04-04 CANV-09 telemetry on AttemptPayload.
//
// Covers:
//   1. AttemptPayload Zod schema accepts the new optional fields (accept_latency_ms +
//      tier) — Plan-04-02 schema extension is live.
//   2. AttemptPayload remains backward-compatible: payloads without the new fields parse.
//   3. dao.seed (atomicAccept-equivalent at the DAO boundary) persists tier +
//      accept_latency_ms through to queryById.
//
// Pure-schema + DAO-roundtrip tests; the RPC-layer round-trip lives in
// atomic-accept.spec.ts.

import { describe, it, expect } from 'vitest';
import { mkTempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO, AttemptPayload } from '../../graph/index.js';

describe('CANV-09 — telemetry on AttemptPayload', () => {
	it('AttemptPayload accepts new optional fields (Plan 04-02)', () => {
		const result = AttemptPayload.safeParse({
			kind: 'Attempt', body: 'x', anchor: { file: 'a' }, accept_latency_ms: 100, tier: 'modal',
		});
		expect(result.success).toBe(true);
	});

	it('AttemptPayload backward-compat: payload without new fields parses', () => {
		const result = AttemptPayload.safeParse({
			kind: 'Attempt', body: 'old', anchor: { file: 'a' },
		});
		expect(result.success).toBe(true);
	});

	it('dao.seed persists accept_latency_ms + tier through to queryById (RPC handler equivalent)', () => {
		const tmp = mkTempDb();
		try {
			const handle = openDatabase(tmp.dbPath);
			const dao = new GraphDAO(handle.db);
			const { id } = dao.seed({
				payload: {
					kind: 'Attempt', body: 'a', anchor: { file: 'src/x.ts' },
					attempt_kind: 'accepted', accept_latency_ms: 999, tier: 'inline',
				},
				provenance: { source: 'canvas', actor: 'developer' },
			});
			const row = dao.queryById(id);
			const payload = row?.payload as { accept_latency_ms?: number; tier?: string };
			expect({
				latency: payload.accept_latency_ms,
				tier: payload.tier,
			}).toEqual({ latency: 999, tier: 'inline' });
			handle.close();
		} finally {
			tmp.dispose();
		}
	});
});
