/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from 'vitest';
import { detectDestructive, destructiveVerbForConfirmation } from '../../canvas/index.js';
import { buildSampleDiff } from '../helpers/canvas-fixtures.js';

describe('CANV-08 — destructive detection', () => {
	it('rm -rf in diff is destructive', () => {
		const d = buildSampleDiff({
			filePath: 'scripts/cleanup.sh',
			oldText: 'echo "noop"',
			newText: 'rm -rf /var/data',
		});
		expect(detectDestructive(d)).toBe(true);
	});

	it('DROP TABLE in diff is destructive (case-insensitive)', () => {
		const d = buildSampleDiff({
			filePath: 'src/db/schema.sql',
			oldText: 'CREATE TABLE users (id INT);',
			newText: 'drop table users;',
		});
		expect(detectDestructive(d)).toBe(true);
	});

	it('git revert in diff is destructive', () => {
		const d = buildSampleDiff({
			filePath: 'scripts/rollback.sh',
			oldText: 'echo "noop"',
			newText: 'git revert HEAD',
		});
		expect(detectDestructive(d)).toBe(true);
	});

	it('migrations/*.sql path is destructive surface even with a benign body', () => {
		const benign = buildSampleDiff({
			filePath: 'src/db/migrations/0009_add_index.sql',
			oldText: '-- empty',
			newText: 'CREATE INDEX idx_users_email ON users(email);',
		});
		expect(detectDestructive(benign, 'src/db/migrations/0009_add_index.sql')).toBe(true);
	});

	it('plain CREATE TABLE diff is NOT destructive', () => {
		const d = buildSampleDiff({
			filePath: 'src/db/schema.sql',
			oldText: 'CREATE TABLE users (id INT);',
			newText: 'CREATE TABLE users (id INT, name TEXT);',
		});
		expect(detectDestructive(d)).toBe(false);
		expect(detectDestructive(d, 'src/db/schema.sql')).toBe(false);
	});

	it('confirmation verb echoes destructive verb (drop, delete, rm, revert, truncate); falls back to "destructive"', () => {
		const dropDiff = buildSampleDiff({ filePath: 'a', oldText: 'x', newText: 'DROP TABLE z;' });
		const rmDiff = buildSampleDiff({ filePath: 'a', oldText: 'x', newText: 'rm -rf /tmp' });
		const revertDiff = buildSampleDiff({ filePath: 'a', oldText: 'x', newText: 'git revert HEAD' });
		const truncateDiff = buildSampleDiff({ filePath: 'a', oldText: 'x', newText: 'TRUNCATE users;' });
		const deleteDiff = buildSampleDiff({ filePath: 'a', oldText: 'x', newText: 'DELETE FROM users;' });
		const benign = buildSampleDiff({ filePath: 'a', oldText: 'x', newText: 'console.log("noop")' });
		expect({
			drop: destructiveVerbForConfirmation(dropDiff),
			rm: destructiveVerbForConfirmation(rmDiff),
			revert: destructiveVerbForConfirmation(revertDiff),
			truncate: destructiveVerbForConfirmation(truncateDiff),
			delete: destructiveVerbForConfirmation(deleteDiff),
			fallback: destructiveVerbForConfirmation(benign),
		}).toEqual({
			drop: 'drop',
			rm: 'rm',
			revert: 'revert',
			truncate: 'truncate',
			delete: 'delete',
			fallback: 'destructive',
		});
	});
});
