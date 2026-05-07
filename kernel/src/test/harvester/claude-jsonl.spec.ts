/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/claude-jsonl.spec.ts — Phase 5 Plan 05-03 (TELE-01).
//
// Real on-disk chokidar watcher exercised via mkdtemp + fs.appendFile + process sleeps for
// chokidar event propagation (~50-150ms per the Phase-4 Plan-04-08 lesson on time-sensitive
// fs tests). The 4 tests cover ROADMAP SC #1 substrate:
//   1. Tail emits one observation per line.
//   2. Persisted byte offset survives watcher restart (kernel restart simulation).
//   3. Inode rotation (rename + create new file) restarts from byte 0.
//   4. Truncation (size < recorded offset) restarts from byte 0.
//
// chokidar 4.0.3 uses fs.watch under the hood. Tests are racy by nature; we wait
// generously and assert via polling rather than fixed sleeps.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, appendFileSync, renameSync, truncateSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../../graph/db.js';
import { OffsetsDao } from '../../harvester/offsets.js';
import { startClaudeJsonlWatcher } from '../../harvester/watchers/claude-jsonl.js';
import type { RawObservation } from '../../harvester/observations.js';
import { submitRawObservation, type HarvesterDeps } from '../../harvester/index.js';

interface WatcherHarness {
	dir: string;
	jsonlPath: string;
	dbHandle: ReturnType<typeof openDatabase>;
	offsets: OffsetsDao;
	captured: RawObservation[];
	deps: HarvesterDeps;
}

function mkHarness(): WatcherHarness {
	const dir = mkdtempSync(join(tmpdir(), 'goatide-jsonl-'));
	const jsonlPath = join(dir, 'session.jsonl');
	const dbHandle = openDatabase(join(dir, 'graph.db'));
	const offsets = new OffsetsDao(dbHandle.sqlite);
	const captured: RawObservation[] = [];
	const deps: HarvesterDeps = {
		enrichGit: async () => ({}),
		promoter: async (obs) => { captured.push(obs); },
	};
	return { dir, jsonlPath, dbHandle, offsets, captured, deps };
}

async function pollUntil(check: () => boolean, timeoutMs = 5_000, stepMs = 50): Promise<boolean> {
	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (check()) {
			return true;
		}
		await new Promise((r) => setTimeout(r, stepMs));
	}
	return check();
}

describe('TELE-01: chokidar tail with persisted offsets', () => {
	let h: WatcherHarness;

	beforeEach(() => {
		h = mkHarness();
	});
	afterEach(() => {
		try { h.dbHandle.close(); } catch { /* best-effort */ }
		try { rmSync(h.dir, { recursive: true, force: true }); } catch { /* best-effort */ }
	});

	it('tails JSONL file and emits one observation per line', async () => {
		writeFileSync(h.jsonlPath, '');
		const close = await startClaudeJsonlWatcher({
			watchPaths: [h.jsonlPath],
			offsets: h.offsets,
			submit: (obs) => submitRawObservation(obs, h.deps),
		});
		try {
			appendFileSync(h.jsonlPath, '{"role":"user","content":"hi"}\n');
			appendFileSync(h.jsonlPath, '{"role":"assistant","content":"hello"}\n');
			appendFileSync(h.jsonlPath, '{"role":"user","content":"again"}\n');
			const ok = await pollUntil(() => h.captured.length >= 3);
			expect({ ok, count: h.captured.length, sources: h.captured.map((o) => o.source) }).toEqual({
				ok: true, count: 3, sources: ['claude_jsonl', 'claude_jsonl', 'claude_jsonl'],
			});
		} finally {
			await close();
		}
	}, 15_000);

	it('persists byte offset across watcher restart and resumes from last byte', async () => {
		writeFileSync(h.jsonlPath, '');
		// Phase 1: write 2 lines, drain.
		const close1 = await startClaudeJsonlWatcher({
			watchPaths: [h.jsonlPath],
			offsets: h.offsets,
			submit: (obs) => submitRawObservation(obs, h.deps),
		});
		appendFileSync(h.jsonlPath, '{"a":1}\n');
		appendFileSync(h.jsonlPath, '{"a":2}\n');
		await pollUntil(() => h.captured.length >= 2);
		await close1();

		const offsetAfterPhase1 = h.offsets.read(h.jsonlPath);
		expect(offsetAfterPhase1?.byte_offset).toBeGreaterThan(0);

		// Phase 2: same DAO + same offsets table, restart watcher, append 1 more line.
		// The watcher must resume from the recorded offset, not re-emit the 2 previous lines.
		const captured2: RawObservation[] = [];
		const deps2: HarvesterDeps = {
			enrichGit: async () => ({}),
			promoter: async (obs) => { captured2.push(obs); },
		};
		const close2 = await startClaudeJsonlWatcher({
			watchPaths: [h.jsonlPath],
			offsets: h.offsets,
			submit: (obs) => submitRawObservation(obs, deps2),
		});
		try {
			appendFileSync(h.jsonlPath, '{"a":3}\n');
			const ok = await pollUntil(() => captured2.length >= 1);
			expect({ ok, count: captured2.length, body: captured2[0]?.body }).toEqual({
				ok: true, count: 1, body: '{"a":3}',
			});
		} finally {
			await close2();
		}
	}, 15_000);

	it('detects inode rotation and restarts from byte 0', async () => {
		writeFileSync(h.jsonlPath, '');
		const close = await startClaudeJsonlWatcher({
			watchPaths: [h.jsonlPath],
			offsets: h.offsets,
			submit: (obs) => submitRawObservation(obs, h.deps),
		});
		try {
			appendFileSync(h.jsonlPath, '{"a":1}\n');
			appendFileSync(h.jsonlPath, '{"a":2}\n');
			await pollUntil(() => h.captured.length >= 2);
			expect(h.captured.length).toBe(2);
			// Rotate: rename current file, create a fresh file at the same path with 1 new line.
			const rotated = h.jsonlPath + '.rotated';
			renameSync(h.jsonlPath, rotated);
			writeFileSync(h.jsonlPath, '{"rotated":true}\n');
			const ok = await pollUntil(() => h.captured.length >= 3);
			expect({ ok, count: h.captured.length, last: h.captured[h.captured.length - 1]?.body }).toEqual({
				ok: true, count: 3, last: '{"rotated":true}',
			});
		} finally {
			await close();
		}
	}, 15_000);

	it('detects truncation (size < recorded offset) and restarts from byte 0', async () => {
		writeFileSync(h.jsonlPath, '');
		const close = await startClaudeJsonlWatcher({
			watchPaths: [h.jsonlPath],
			offsets: h.offsets,
			submit: (obs) => submitRawObservation(obs, h.deps),
		});
		try {
			appendFileSync(h.jsonlPath, '{"a":1}\n');
			appendFileSync(h.jsonlPath, '{"a":2}\n');
			appendFileSync(h.jsonlPath, '{"a":3}\n');
			await pollUntil(() => h.captured.length >= 3);
			expect(h.captured.length).toBe(3);
			// Truncate to 0 bytes, then append a fresh line.
			truncateSync(h.jsonlPath, 0);
			expect(existsSync(h.jsonlPath)).toBe(true);
			appendFileSync(h.jsonlPath, '{"truncated":true}\n');
			const ok = await pollUntil(() => h.captured.length >= 4);
			expect({ ok, count: h.captured.length, last: h.captured[h.captured.length - 1]?.body }).toEqual({
				ok: true, count: 4, last: '{"truncated":true}',
			});
		} finally {
			await close();
		}
	}, 15_000);
});
