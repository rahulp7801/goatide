/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/rpc/recordContractOverride-repo-id.spec.ts -- Phase 21 Plan 21-01 XREPO-01-S8.
//
// RED stub. Open Decision S8 fence-symmetry inclusion: recordContractOverride gains
// `repo_id?: string` on the same wave as the other 3 write RPCs so all write paths
// uniformly accept the parameter.
//
// Two cases mirroring atomicAccept-repo-id.spec.ts:
// (a) recordContractOverride with explicit repo_id='testrepofingerprint' asserts
//     provenance.detail.repo_id === 'testrepofingerprint' in the persisted Attempt node.
// (b) recordContractOverride WITHOUT repo_id asserts provenance.detail.repo_id === 'primary'
//     (XREPO-01e default invariant).
//
// Today (Wave 0): repo_id is NOT declared on RecordContractOverrideParams. RED today;
// GREEN after Plan 21-02 adds the field and wires it into provenance.detail.
//
// Deviation note: REQUIREMENTS XREPO-01 enumerates 3 RPCs; this plan extends 4 per
// Open Decision S8 -- documented as N1 deliberate-departure in 21-01-SUMMARY.md.
//
// Grep alignment: 'recordContractOverride.*repo_id' + 'recordContractOverride.*default.*primary'.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Duplex } from 'node:stream';
import * as rpc from 'vscode-jsonrpc/node.js';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { openDatabase, GraphDAO } from '../../graph/index.js';
import { ReceiptDAO } from '../../receipt/index.js';
import { createRpcServer } from '../../rpc/index.js';
import { RecordContractOverrideRequest } from '../../rpc/methods.js';

interface PairedStreams {
	clientReader: rpc.MessageReader;
	clientWriter: rpc.MessageWriter;
	serverReader: rpc.MessageReader;
	serverWriter: rpc.MessageWriter;
}

function pairedStreams(): PairedStreams {
	const a = new Duplex({ read() { /* push from outside */ }, write(c, _e, cb) { b.push(c); cb(); } });
	const b = new Duplex({ read() { /* push from outside */ }, write(c, _e, cb) { a.push(c); cb(); } });
	return {
		clientReader: new rpc.StreamMessageReader(b),
		clientWriter: new rpc.StreamMessageWriter(b),
		serverReader: new rpc.StreamMessageReader(a),
		serverWriter: new rpc.StreamMessageWriter(a),
	};
}

describe('Phase 21 XREPO-01-S8 -- graph.recordContractOverride repo_id threading (RED stub)', () => {
	let tmp: TempDb;

	beforeEach(() => { tmp = mkTempDb(); });
	afterEach(() => { tmp.dispose(); });

	it('recordContractOverride rides repo_id into provenance.detail', async () => {
		const handle = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(handle.db);
		const receiptDao = new ReceiptDAO(handle.db);

		// Seed a ContractNode to override
		const { id: contractNodeId } = dao.seed({
			payload: {
				kind: 'ContractNode',
				body: '# Auth contract\n\nAll auth flows must be reviewed.',
				anchor: { file: 'src/auth/contract.md' },
			},
			provenance: { source: 'cli', actor: 'phase-21-test' },
		});

		const streams = pairedStreams();
		const server = createRpcServer({ dao, receiptDao, sqlite: handle.sqlite, reader: streams.serverReader, writer: streams.serverWriter });
		server.listen();
		const client = rpc.createMessageConnection(streams.clientReader, streams.clientWriter);
		client.listen();

		// Cast params to include repo_id which arrives in Plan 21-02 (XREPO-01-S8).
		const params = {
			change_id: '01J' + 'C'.repeat(23),
			contract_node_id: contractNodeId,
			section_name: 'Auth flows',
			note: 'emergency hotfix: overriding the auth contract for the rollback window',
			repo_id: 'testrepofingerprint', // Plan 21-02 will declare this on RecordContractOverrideParams.
		} as unknown as import('../../rpc/methods.js').RecordContractOverrideParams;
		const result = await client.sendRequest(RecordContractOverrideRequest, params);

		const provRow = dao.queryProvenance(result.attempt_node_id);
		const provDetail = provRow?.detail as { repo_id?: string } | null;

		// RED today: handler does not yet write repo_id into provenance.detail.
		// GREEN after Plan 21-02 threads repo_id from params into the detail map.
		expect(provDetail?.repo_id).toBe('testrepofingerprint');

		client.dispose();
		server.dispose();
		handle.close();
	});

	it('recordContractOverride default repo_id is primary when omitted', async () => {
		const handle = openDatabase(tmp.dbPath);
		const dao = new GraphDAO(handle.db);
		const receiptDao = new ReceiptDAO(handle.db);

		// Seed a ContractNode to override
		const { id: contractNodeId } = dao.seed({
			payload: {
				kind: 'ContractNode',
				body: '# Auth contract\n\nAll auth flows must be reviewed.',
				anchor: { file: 'src/auth/contract.md' },
			},
			provenance: { source: 'cli', actor: 'phase-21-test' },
		});

		const streams = pairedStreams();
		const server = createRpcServer({ dao, receiptDao, sqlite: handle.sqlite, reader: streams.serverReader, writer: streams.serverWriter });
		server.listen();
		const client = rpc.createMessageConnection(streams.clientReader, streams.clientWriter);
		client.listen();

		const result = await client.sendRequest(RecordContractOverrideRequest, {
			change_id: '01J' + 'D'.repeat(23),
			contract_node_id: contractNodeId,
			section_name: 'Auth flows',
			note: 'overriding the auth contract: no cross-repo context',
			// repo_id intentionally omitted -- XREPO-01e default invariant: must default to 'primary'.
		});

		const provRow = dao.queryProvenance(result.attempt_node_id);
		const provDetail = provRow?.detail as { repo_id?: string } | null;

		// RED today: handler does not yet write repo_id at all.
		// GREEN after Plan 21-02 defaults omitted repo_id to 'primary' in the detail map.
		expect(provDetail?.repo_id).toBe('primary');

		client.dispose();
		server.dispose();
		handle.close();
	});
});
