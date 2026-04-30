/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 3 (Plan 03-02) Task 3 — fill in TRAV-04 + TRAV-06 (replaces Wave-0 it.skip stubs).
// Real assertions exercising:
//   - TRAV-04: file/symbol/ticket/node_id exact-equality dispatch
//   - TRAV-06: unresolvable inputs return [] (no fallback); case-mismatched inputs return []
//   - Bitemporal: anchor lookup respects asOf

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkTempDb, type TempDb } from '../helpers/temp-db.js';
import { seedAnchoredNodes } from '../helpers/graph-fixtures.js';
import { openDatabase, GraphDAO, resolveAnchor, type OpenDatabaseHandle } from '../../graph/index.js';

describe('Phase 3 — anchor resolution', () => {
	let tmp: TempDb;
	let handle: OpenDatabaseHandle;
	let dao: GraphDAO;
	const now = () => new Date().toISOString();

	beforeEach(() => {
		tmp = mkTempDb();
		handle = openDatabase(tmp.dbPath);
		dao = new GraphDAO(handle.db);
	});

	afterEach(() => {
		handle.close();
		tmp.dispose();
	});

	describe('TRAV-04 — deterministic anchor resolution (file / symbol / ticket / node_id)', () => {
		it('file / symbol / ticket exact match returns the seeded node; node_id direct lookup works', () => {
			const { nodeIds } = seedAnchoredNodes(dao, handle.sqlite, [
				{ file: 'src/auth.ts' },
				{ symbol: 'AuthService' },
				{ ticket_id: 'GOAT-123' },
			]);
			const byFile = resolveAnchor(dao, { kind: 'file', path: 'src/auth.ts' }, now());
			const bySymbol = resolveAnchor(dao, { kind: 'symbol', symbol: 'AuthService' }, now());
			const byTicket = resolveAnchor(dao, { kind: 'ticket', id: 'GOAT-123' }, now());
			const byId = resolveAnchor(dao, { kind: 'node_id', id: nodeIds[0] }, now());
			expect({
				byFileIds: byFile.map((n) => n.id),
				bySymbolIds: bySymbol.map((n) => n.id),
				byTicketIds: byTicket.map((n) => n.id),
				byIdIds: byId.map((n) => n.id),
			}).toEqual({
				byFileIds: [nodeIds[0]],
				bySymbolIds: [nodeIds[1]],
				byTicketIds: [nodeIds[2]],
				byIdIds: [nodeIds[0]],
			});
		});

		it('case-mismatched / typo inputs return [] (proves no LOWER/LIKE/fuzzy)', () => {
			seedAnchoredNodes(dao, handle.sqlite, [{ file: 'src/auth.ts' }, { symbol: 'AuthService' }]);
			expect({
				upperPath: resolveAnchor(dao, { kind: 'file', path: 'SRC/AUTH.TS' }, now()).length,
				typoPath: resolveAnchor(dao, { kind: 'file', path: 'src/auth.t' }, now()).length,
				partialSymbol: resolveAnchor(dao, { kind: 'symbol', symbol: 'Auth' }, now()).length,
				lowerSymbol: resolveAnchor(dao, { kind: 'symbol', symbol: 'authservice' }, now()).length,
			}).toEqual({ upperPath: 0, typoPath: 0, partialSymbol: 0, lowerSymbol: 0 });
		});
	});

	describe('TRAV-06 — unresolvable returns empty (no fallback)', () => {
		it('all four kinds with garbage input return []', () => {
			seedAnchoredNodes(dao, handle.sqlite, [{ file: 'src/auth.ts' }]);
			expect({
				file: resolveAnchor(dao, { kind: 'file', path: 'no/such/file.ts' }, now()).length,
				symbol: resolveAnchor(dao, { kind: 'symbol', symbol: 'NoSuchSymbol' }, now()).length,
				ticket: resolveAnchor(dao, { kind: 'ticket', id: 'NOPE-9999' }, now()).length,
				nodeId: resolveAnchor(dao, { kind: 'node_id', id: '00000000000000000000000000' }, now()).length,
			}).toEqual({ file: 0, symbol: 0, ticket: 0, nodeId: 0 });
		});

		it('multiple nodes with same file anchor: all returned, deterministic order', () => {
			const { nodeIds } = seedAnchoredNodes(dao, handle.sqlite, [
				{ file: 'src/shared.ts' },
				{ file: 'src/shared.ts' },
				{ file: 'src/shared.ts' },
			]);
			const r = resolveAnchor(dao, { kind: 'file', path: 'src/shared.ts' }, now());
			expect({
				count: r.length,
				idsMatch: r.map((n) => n.id).sort().join(',') === nodeIds.slice().sort().join(','),
			}).toEqual({ count: 3, idsMatch: true });
		});
	});

	describe('Bitemporal — anchor lookup respects asOf', () => {
		it('asOf=<before-seed> returns []; asOf=now returns the node', () => {
			const beforeSeed = new Date(Date.now() - 60_000).toISOString();
			const { nodeIds } = seedAnchoredNodes(dao, handle.sqlite, [{ file: 'src/x.ts' }]);
			const past = resolveAnchor(dao, { kind: 'file', path: 'src/x.ts' }, beforeSeed);
			const present = resolveAnchor(dao, { kind: 'file', path: 'src/x.ts' }, now());
			expect({ pastCount: past.length, presentIds: present.map((n) => n.id) }).toEqual({ pastCount: 0, presentIds: [nodeIds[0]] });
		});
	});
});
