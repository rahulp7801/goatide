/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/offsets.ts — Phase 5 Plan 05-03.
//
// OffsetsDao: thin wrapper over the harvest_offsets table created by the 0005 migration
// (Plan 05-01). Stores per-file byte offsets so the chokidar JSONL watcher can resume
// from the last consumed byte across kernel restarts (Pitfall 1: ignoreInitial:false +
// offset replay).
//
// Wraps the same better-sqlite3 connection the GraphDAO uses; prepared statements built
// once per DAO instance.

import type Database from 'better-sqlite3';

export interface OffsetRow {
	absolute_path: string;
	byte_offset: number;
	last_inode: number;
	last_mtime_ms: number;
	updated_at: number;
}

export interface WriteOffsetInput {
	absolute_path: string;
	byte_offset: number;
	last_inode: number;
	last_mtime_ms: number;
}

/**
 * DAO for the harvest_offsets table. Construct once per DB connection; share across
 * watcher invocations. Methods are synchronous (better-sqlite3 contract).
 */
export class OffsetsDao {
	private readonly readStmt: Database.Statement;
	private readonly writeStmt: Database.Statement;
	private readonly deleteStmt: Database.Statement;

	constructor(sqlite: Database.Database) {
		this.readStmt = sqlite.prepare(`
			SELECT absolute_path, byte_offset, last_inode, last_mtime_ms, updated_at
			FROM harvest_offsets
			WHERE absolute_path = ?
		`);
		this.writeStmt = sqlite.prepare(`
			INSERT OR REPLACE INTO harvest_offsets
				(absolute_path, byte_offset, last_inode, last_mtime_ms, updated_at)
			VALUES (?, ?, ?, ?, ?)
		`);
		this.deleteStmt = sqlite.prepare(`DELETE FROM harvest_offsets WHERE absolute_path = ?`);
	}

	read(absolutePath: string): OffsetRow | null {
		const row = this.readStmt.get(absolutePath) as OffsetRow | undefined;
		return row ?? null;
	}

	write(input: WriteOffsetInput): void {
		this.writeStmt.run(
			input.absolute_path,
			input.byte_offset,
			input.last_inode,
			input.last_mtime_ms,
			Date.now(),
		);
	}

	deleteByPath(absolutePath: string): void {
		this.deleteStmt.run(absolutePath);
	}
}
