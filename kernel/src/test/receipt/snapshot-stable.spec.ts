/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Plan 03-03 Task 3: REC-03 snapshot-stable render — supersede the cited node AFTER
// receipt compose, then renderReceipt must resolve to the SAME version cited at compose
// time (the row is never deleted; queryById hits it by exact ULID), with cited_invalidated_at
// now non-null and successor_id pointing to the new head for the "superseded by ->" badge.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO, type OpenDatabaseHandle } from '../../graph/index.js';
import { buildReceipt, renderReceipt, ReceiptDAO } from '../../receipt/index.js';

const SAMPLE_DIFF = `diff --git a/src/auth.ts b/src/auth.ts
index 1234..5678 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,3 +1,4 @@
 export function login() {
+	// new line
 	return null;
 }
`;

describe('REC-03 — snapshot-stable render', () => {
	let tmp: TempDb;
	let handle: OpenDatabaseHandle;
	let dao: GraphDAO;
	let receiptDao: ReceiptDAO;
	const now = () => new Date().toISOString();

	beforeEach(() => {
		tmp = mkTempDb();
		handle = openDatabase(tmp.dbPath);
		dao = new GraphDAO(handle.db);
		receiptDao = new ReceiptDAO(handle.db);
	});

	afterEach(() => {
		handle.close();
		tmp.dispose();
	});

	it('cited node superseded after compose: render preserves cited version + emits successor_id', async () => {
		const { id: oldId } = dao.seed({
			payload: { kind: 'ConstraintNode', body: 'original auth rule', anchor: { file: 'src/auth.ts' } },
			provenance: { source: 'cli', actor: 'test' },
		});

		// Compose receipt against the original node.
		const receipt = buildReceipt({ diff: SAMPLE_DIFF, destructive: false, asOf: now() }, dao, receiptDao, handle.sqlite);
		expect(receipt.citations.length).toBe(1);
		expect(receipt.citations[0].node_id).toBe(oldId);

		// Wait so timestamps differ then supersede the cited node.
		await new Promise((r) => setTimeout(r, 5));
		const { newId } = dao.supersede(oldId, { kind: 'ConstraintNode', body: 'revised auth rule', anchor: { file: 'src/auth.ts' } });

		// Render: receipt was composed against `oldId`; render should resolve to oldId's
		// payload (NOT newId's), and successor_id should point to newId.
		const rendered = renderReceipt(receipt, dao);
		const c = rendered.citations[0];
		expect({
			citedNodeId: c.node_id,
			citedBody: (c.cited_payload as { body: string } | null)?.body,
			invalidatedNotNull: c.cited_invalidated_at !== null,
			successorEqualsNew: c.successor_id === newId,
		}).toEqual({
			citedNodeId: oldId,
			citedBody: 'original auth rule',
			invalidatedNotNull: true,
			successorEqualsNew: true,
		});
	});

	it('uncited / unsuperseded node: cited_invalidated_at is null, successor_id is null', () => {
		dao.seed({
			payload: { kind: 'ConstraintNode', body: 'still active', anchor: { file: 'src/auth.ts' } },
			provenance: { source: 'cli', actor: 'test' },
		});
		const r = buildReceipt({ diff: SAMPLE_DIFF, destructive: false, asOf: now() }, dao, receiptDao, handle.sqlite);
		const rendered = renderReceipt(r, dao);
		const c = rendered.citations[0];
		expect({
			invalidated: c.cited_invalidated_at,
			successor: c.successor_id,
			payloadBody: (c.cited_payload as { body: string } | null)?.body,
		}).toEqual({ invalidated: null, successor: null, payloadBody: 'still active' });
	});
});
