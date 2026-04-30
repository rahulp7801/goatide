/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Plan 03-03 Task 1 RED — smoke spec for the canonical Citation schema, ReceiptDAO write/read,
// and the new GraphDAO.findSuccessor + queryProvenance methods. Drives the RED→GREEN cycle for
// the structural scaffolding ahead of the buildReceipt + renderReceipt logic in Tasks 2 & 3.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO, type OpenDatabaseHandle } from '../../graph/index.js';
import { CitationSchema, ReceiptDAO } from '../../receipt/index.js';

describe('Plan 03-03 Task 1 — citation schema + ReceiptDAO + GraphDAO additions', () => {
	let tmp: TempDb;
	let handle: OpenDatabaseHandle;
	let dao: GraphDAO;
	let receiptDao: ReceiptDAO;

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

	it('CitationSchema validates a 26-char ULID tuple and rejects bad shapes', () => {
		const ok = CitationSchema.safeParse({
			node_id: '01H8XGJWBWBAQ4G4D8R2T7Z9KE',
			version: '01H8XGJWBWBAQ4G4D8R2T7Z9KE',
			confidence: 'Explicit',
			edge_path: '/parent_of:01HABC',
			snippet: 'short body',
		});
		const tooShortNodeId = CitationSchema.safeParse({
			node_id: 'shortid',
			version: '01H8XGJWBWBAQ4G4D8R2T7Z9KE',
			confidence: 'Explicit',
			edge_path: '',
			snippet: 'x',
		});
		const longSnippet = CitationSchema.safeParse({
			node_id: '01H8XGJWBWBAQ4G4D8R2T7Z9KE',
			version: '01H8XGJWBWBAQ4G4D8R2T7Z9KE',
			confidence: 'Inferred',
			edge_path: '',
			snippet: 'x'.repeat(281),
		});
		expect({
			okSuccess: ok.success,
			shortIdRejected: !tooShortNodeId.success,
			longSnippetRejected: !longSnippet.success,
		}).toEqual({ okSuccess: true, shortIdRejected: true, longSnippetRejected: true });
	});

	it('ReceiptDAO.write + read round-trips a receipt by id', () => {
		const receipt = {
			id: '01H8XGJWBWBAQ4G4D8R2T7Z9KE',
			change_id: '01H8XGJWBWBAQ4G4D8R2T7Z9KF',
			citations: [{
				node_id: '01H8XGJWBWBAQ4G4D8R2T7Z9KG',
				version: '01H8XGJWBWBAQ4G4D8R2T7Z9KG',
				confidence: 'Explicit' as const,
				edge_path: '',
				snippet: 'a snippet',
			}],
			drill_chain: ['/parent_of:01HABC'],
			destructive: false,
			graph_snapshot_tx_time: '2026-04-30T15:00:00.000Z',
		};
		receiptDao.write(receipt);
		const back = receiptDao.read(receipt.id);
		expect({
			id: back?.id,
			change_id: back?.change_id,
			citations: back?.citations,
			drill_chain: back?.drill_chain,
			destructive: back?.destructive,
			graph_snapshot_tx_time: back?.graph_snapshot_tx_time,
			missing: receiptDao.read('01H0000000000000000000000Z'),
		}).toEqual({
			id: receipt.id,
			change_id: receipt.change_id,
			citations: receipt.citations,
			drill_chain: receipt.drill_chain,
			destructive: receipt.destructive,
			graph_snapshot_tx_time: receipt.graph_snapshot_tx_time,
			missing: null,
		});
	});

	it('GraphDAO.findSuccessor walks supersedes edge to the new head; null for active head', () => {
		const { id: oldId } = dao.seed({
			payload: { kind: 'ConstraintNode', body: 'v1' },
			provenance: { source: 'cli', actor: 'test' },
		});
		const noSuccessor = dao.findSuccessor(oldId);
		const { newId } = dao.supersede(oldId, { kind: 'ConstraintNode', body: 'v2' });
		const successor = dao.findSuccessor(oldId);
		expect({
			beforeSupersede: noSuccessor,
			afterSupersedeId: successor?.id,
			afterSupersedeBody: (successor?.payload as { body: string } | undefined)?.body,
			headHasNoSuccessor: dao.findSuccessor(newId),
		}).toEqual({
			beforeSupersede: null,
			afterSupersedeId: newId,
			afterSupersedeBody: 'v2',
			headHasNoSuccessor: null,
		});
	});

	it('GraphDAO.queryProvenance returns the provenance row or null', () => {
		const { id } = dao.seed({
			payload: { kind: 'ConstraintNode', body: 'rule body' },
			provenance: { source: 'cli', actor: 'rahul', detail: { ticket: 'GOAT-1' } },
		});
		const prov = dao.queryProvenance(id);
		expect({
			node_id: prov?.node_id,
			source: prov?.source,
			actor: prov?.actor,
			detail: prov?.detail,
			recordedAtPresent: !!prov?.recorded_at,
			missing: dao.queryProvenance('01H0000000000000000000000Z'),
		}).toEqual({
			node_id: id,
			source: 'cli',
			actor: 'rahul',
			detail: { ticket: 'GOAT-1' },
			recordedAtPresent: true,
			missing: null,
		});
	});
});
