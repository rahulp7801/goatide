/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/watchers/claude-jsonl.ts — Phase 5 Plan 05-03 (TELE-01).
//
// Tail observer over ~/.claude/projects/**/*.jsonl with persisted byte offset. Per
// 05-RESEARCH.md ## Pattern: Tail Observer with Persisted Offset:
//
//   chokidar 4.0 fs.watch() under the hood (no fsevents native).
//   Options: persistent:true, ignoreInitial:false (Pitfall 1: read transcripts written
//   while the IDE was down — ROADMAP SC #1), awaitWriteFinish:false (per-line tail).
//
// On 'add'/'change' events:
//   1. statSync the file. Read prev-offset row from harvest_offsets DAO.
//   2. If prev exists AND prev.last_inode === stat.ino AND stat.size >= prev.byte_offset
//      → resume from prev.byte_offset.
//      Otherwise (rotation: inode changed; truncation: size shrank; first time: no prev)
//      → restart from byte 0.
//   3. Stream from offset to EOF; for each newline-terminated line, parse JSON
//      (try/catch — malformed line is logged + skipped, but consumedBytes still advances).
//   4. submitObservation per line.
//   5. After draining, write the new offset (byte position past the last full line).
//
// Pitfall: chokidar may fire 'change' before the writer flushes a complete line. The
// "consumed bytes = position after last newline" rule keeps the offset stable across
// partial-write events; the next 'change' picks up the rest.

import { watch, type FSWatcher } from 'chokidar';
import { statSync, createReadStream } from 'node:fs';
import { ulid } from 'ulid';
import type { OffsetsDao } from '../offsets.js';
import type { RawObservation } from '../observations.js';

export interface StartClaudeJsonlWatcherArgs {
	/**
	 * Glob patterns or absolute paths to watch. Production passes
	 * ['<homedir>/.claude/projects/**\/*.jsonl']; tests pass an explicit file path so
	 * they don't touch the developer's real Claude transcripts.
	 */
	watchPaths: readonly string[];
	offsets: OffsetsDao;
	submit: (observation: RawObservation) => Promise<unknown>;
}

export type StopClaudeJsonlWatcher = () => Promise<void>;

/**
 * Start the Claude JSONL chokidar watcher. Returns a close handle that must be invoked
 * during clean shutdown (the daemon's close() handler does this).
 */
export async function startClaudeJsonlWatcher(args: StartClaudeJsonlWatcherArgs): Promise<StopClaudeJsonlWatcher> {
	const watcher: FSWatcher = watch([...args.watchPaths], {
		persistent: true,
		ignoreInitial: false,             // Pitfall 1 — non-negotiable
		awaitWriteFinish: false,
	});

	// Per-path serial drain queue. Multiple 'change' events for the same file should not
	// overlap reads — they would race on the offset state. We chain promises per-path so
	// each drain runs to completion before the next starts.
	const drainChains = new Map<string, Promise<void>>();
	let closing = false;

	const enqueueDrain = (absolutePath: string): void => {
		if (closing) {
			return;
		}
		const prev = drainChains.get(absolutePath) ?? Promise.resolve();
		const next = prev
			.then(() => drainOne(absolutePath, args))
			.catch((e) => {
				console.error(`[harvester/claude-jsonl] drain error for ${absolutePath}: ${e instanceof Error ? e.message : String(e)}`);
			});
		drainChains.set(absolutePath, next);
	};

	watcher.on('add', (path) => enqueueDrain(path));
	watcher.on('change', (path) => enqueueDrain(path));
	watcher.on('error', (err) => {
		console.error(`[harvester/claude-jsonl] watcher error: ${err instanceof Error ? err.message : String(err)}`);
	});

	// Wait for the initial scan to settle so callers can append immediately after the
	// watcher start completes.
	await new Promise<void>((resolve) => {
		watcher.once('ready', () => resolve());
	});

	return async (): Promise<void> => {
		closing = true;
		// Drain any in-flight chains before closing the watcher.
		const pending = Array.from(drainChains.values());
		await Promise.allSettled(pending);
		await watcher.close();
	};
}

/**
 * Drain newly-appended lines from a single JSONL file, advancing the persisted offset.
 * Each line yields one observation submitted via args.submit.
 */
async function drainOne(absolutePath: string, args: StartClaudeJsonlWatcherArgs): Promise<void> {
	let stat;
	try {
		stat = statSync(absolutePath);
	} catch (e) {
		// File may have been removed between event + stat; nothing to do.
		console.error(`[harvester/claude-jsonl] stat failed for ${absolutePath}: ${e instanceof Error ? e.message : String(e)}`);
		return;
	}
	if (!stat.isFile()) {
		return;
	}

	const prev = args.offsets.read(absolutePath);
	const sameFile = prev !== null
		&& prev.last_inode === Number(stat.ino)
		&& stat.size >= prev.byte_offset;
	const startOffset = sameFile ? prev.byte_offset : 0;

	if (startOffset >= stat.size) {
		// Nothing new to read; refresh offset row anyway so last_mtime_ms tracks.
		args.offsets.write({
			absolute_path: absolutePath,
			byte_offset: startOffset,
			last_inode: Number(stat.ino),
			last_mtime_ms: stat.mtimeMs,
		});
		return;
	}

	const stream = createReadStream(absolutePath, { start: startOffset, encoding: 'utf8' });
	let buffer = '';
	let consumed = startOffset;

	const submitLine = async (line: string): Promise<void> => {
		// Skip empty lines but advance offset (the trailing newline counts).
		if (line.length === 0) {
			return;
		}
		let parsed: unknown = undefined;
		try {
			parsed = JSON.parse(line);
		} catch (e) {
			console.error(`[harvester/claude-jsonl] malformed JSONL line in ${absolutePath} at offset ${consumed}: ${e instanceof Error ? e.message : String(e)}`);
		}
		const obs: RawObservation = {
			id: ulid(),
			source: 'claude_jsonl',
			body: line,
			ts: new Date().toISOString(),
			file_path: absolutePath,
			parsed,
		};
		try {
			await args.submit(obs);
		} catch (e) {
			console.error(`[harvester/claude-jsonl] submit failed: ${e instanceof Error ? e.message : String(e)}`);
		}
	};

	for await (const chunk of stream) {
		buffer += chunk;
		let newlineIdx = buffer.indexOf('\n');
		while (newlineIdx !== -1) {
			const line = buffer.slice(0, newlineIdx);
			buffer = buffer.slice(newlineIdx + 1);
			consumed += Buffer.byteLength(line, 'utf8') + 1; // +1 for the consumed '\n'
			await submitLine(line);
			newlineIdx = buffer.indexOf('\n');
		}
	}
	// `buffer` now holds an incomplete trailing line (if any); leave it for the next
	// 'change' event. consumed already points to the byte after the last newline.

	args.offsets.write({
		absolute_path: absolutePath,
		byte_offset: consumed,
		last_inode: Number(stat.ino),
		last_mtime_ms: stat.mtimeMs,
	});
}
