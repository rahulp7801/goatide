/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/schema-drift/snapshot.spec.ts — Phase 6 (Plan 06-04) MCP-07 snapshot.
//
// Three contracts pinned:
//  1. canonicalHash is stable across key reordering ({a:1, b:2} === {b:2, a:1} → same hex).
//  2. writeSnapshot creates the parent directory and persists the JSON; readSnapshot retrieves
//     the round-tripped value.
//  3. readSnapshot returns null when the file is missing (caller signals first-ever connect).
//
// Tests redirect XDG_CONFIG_HOME / APPDATA to a per-test temp directory so the host's real
// ~/.config/goatide/ is never touched.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonicalHash, readSnapshot, writeSnapshot, type ProviderSnapshot } from '../../../mcp/schema-drift/snapshot.js';
import { resolveSchemaSnapshotPath } from '../../../mcp/schema-drift/paths.js';

describe('MCP-07: schema-drift snapshot persistence (canonical hash + read/write)', () => {
	let tmpRoot: string;
	let prevXdg: string | undefined;
	let prevAppdata: string | undefined;

	beforeEach(() => {
		tmpRoot = mkdtempSync(join(tmpdir(), 'goatide-mcp-snap-'));
		prevXdg = process.env.XDG_CONFIG_HOME;
		prevAppdata = process.env.APPDATA;
		process.env.XDG_CONFIG_HOME = tmpRoot;
		process.env.APPDATA = tmpRoot;
	});

	afterEach(() => {
		if (prevXdg === undefined) {
			delete process.env.XDG_CONFIG_HOME;
		} else {
			process.env.XDG_CONFIG_HOME = prevXdg;
		}
		if (prevAppdata === undefined) {
			delete process.env.APPDATA;
		} else {
			process.env.APPDATA = prevAppdata;
		}
		rmSync(tmpRoot, { recursive: true, force: true });
	});

	it('MCP-07: canonicalHash stable across key reordering (sorted-keys SHA256)', () => {
		const a = canonicalHash({ a: 1, b: 2, c: { x: 'y', z: 'w' } });
		const b = canonicalHash({ c: { z: 'w', x: 'y' }, b: 2, a: 1 });
		// Different VALUE → different hash.
		const different = canonicalHash({ a: 1, b: 3 });
		// Arrays are order-sensitive (intentional: argument order matters in JSON Schema).
		const arr1 = canonicalHash([1, 2, 3]);
		const arr2 = canonicalHash([3, 2, 1]);
		expect({
			equalAcrossKeyOrder: a === b,
			differentAcrossValueChange: a !== different,
			arrayOrderMatters: arr1 !== arr2,
			isHexSha256: /^[0-9a-f]{64}$/.test(a),
		}).toEqual({
			equalAcrossKeyOrder: true,
			differentAcrossValueChange: true,
			arrayOrderMatters: true,
			isHexSha256: true,
		});
	});

	it('MCP-07: writeSnapshot creates parent dir + persists provider snapshot to ~/.config/goatide/mcp/schema-snapshots/<provider>.json', () => {
		const snapshot: ProviderSnapshot = {
			provider: 'slack',
			recorded_at: '2026-05-07T00:00:00Z',
			tools: [{
				name: 'thread_fetch',
				input_schema_hash: 'abc123',
				output_schema_hash: 'def456',
				raw_schema: { input: { type: 'object' }, output: null },
			}],
		};
		const path = resolveSchemaSnapshotPath('slack');
		writeSnapshot(snapshot);
		const roundTrip = readSnapshot('slack');
		expect({
			pathContainsGoatideMcp: path.includes(join('goatide', 'mcp', 'schema-snapshots')),
			fileExists: existsSync(path),
			roundTrip,
		}).toEqual({
			pathContainsGoatideMcp: true,
			fileExists: true,
			roundTrip: snapshot,
		});
	});

	it('MCP-07: readSnapshot returns null when file missing', () => {
		const result = readSnapshot('jira');
		expect(result).toBeNull();
	});
});
