/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Shared Phase-4 test fixtures used by:
//   - kernel/src/test/canvas/* (Plan 04-02 — pure classifier + destructive detector tests)
//   - kernel/src/test/rpc/{atomic-accept,reject,telemetry,recovery}.spec.ts (Plan 04-04)
//   - phase-verify benchmark + manual walkthroughs (Plan 04-06)
//
// Modeled on kernel/src/test/helpers/graph-fixtures.ts (Phase 3) — the same factory pattern
// keeps every Phase-4 test seeded with the same shape of canonical data.

import type Database from 'better-sqlite3';
import type { GraphDAO } from '../../graph/index.js';

export interface AnchoredConstraintFixture {
	nodeId: string;
	file: string;
}

/**
 * Seed a single ConstraintNode anchored to a file path. Used by the Plan-04-02 classifier
 * tests (ContractNode high-impact signal needs a citable node) and by the Plan-04-04
 * atomic-accept tests (the Attempt's `references` edge points at this node).
 */
export function seedAnchoredConstraint(
	dao: GraphDAO,
	_sqlite: Database.Database,
	opts: { file: string; body?: string },
): AnchoredConstraintFixture {
	const { id } = dao.seed({
		payload: {
			kind: 'ConstraintNode',
			body: opts.body ?? `Phase-4 hand-seeded rule for ${opts.file}`,
			anchor: { file: opts.file },
		},
		provenance: { source: 'cli', actor: 'phase-4-test' },
	});
	return { nodeId: id, file: opts.file };
}

/**
 * Build a minimal unified-diff string. The Phase-3 builder.spec.ts already covers the
 * jsdiff round-trip on this shape — here it's just a string source for classifier tests.
 */
export function buildSampleDiff(opts: { filePath: string; oldText: string; newText: string }): string {
	const a = opts.oldText.split('\n');
	const b = opts.newText.split('\n');
	const p = opts.filePath;
	const lines = [
		`diff --git a/${p} b/${p}`,
		`--- a/${p}`,
		`+++ b/${p}`,
		`@@ -1,${a.length} +1,${b.length} @@`,
		...a.map((l) => '-' + l),
		...b.map((l) => '+' + l),
		'',
	];
	return lines.join('\n');
}

export interface DestructiveContextFixtures {
	dropTableDiff: string;
	rmRfDiff: string;
	gitRevertDiff: string;
	plainDiff: string;
	contractNodeId: string;
}

/**
 * Seed a ContractNode anchored to a destructive-surface file + return three flavors of
 * destructive diffs and one non-destructive baseline. Plan 04-02's destructive-detector
 * tests use these directly.
 */
export function seedDestructiveContextDb(
	dao: GraphDAO,
	sqlite: Database.Database,
): DestructiveContextFixtures {
	const seeded = seedAnchoredConstraint(dao, sqlite, {
		file: 'src/db/schema.sql',
		body: 'Database tables are immutable in production',
	});
	return {
		contractNodeId: seeded.nodeId,
		dropTableDiff: buildSampleDiff({
			filePath: 'src/db/schema.sql',
			oldText: 'CREATE TABLE users (id INT);',
			newText: 'DROP TABLE users;',
		}),
		rmRfDiff: buildSampleDiff({
			filePath: 'scripts/cleanup.sh',
			oldText: 'echo "no-op"',
			newText: 'rm -rf /var/data',
		}),
		gitRevertDiff: buildSampleDiff({
			filePath: 'scripts/rollback.sh',
			oldText: 'echo "no-op"',
			newText: 'git revert HEAD',
		}),
		plainDiff: buildSampleDiff({
			filePath: 'src/db/schema.sql',
			oldText: 'CREATE TABLE users (id INT);',
			newText: 'CREATE TABLE users (id INT, name TEXT);',
		}),
	};
}
