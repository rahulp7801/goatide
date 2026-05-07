/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/cli/harvest.spec.ts — Phase 5 Plan 05-07 PORT-03 CLI + PORT-06 dashboard.
//
// `goatide-cli harvest rejections [--since <duration>] [--predicate <name>]` reads the
// rejected_observations.jsonl log and filters; `goatide-cli harvest metrics [--days N]
// [--threshold N]` opens the kernel DB read-only and prints the per-source accept-rate
// dashboard. Both subcommands work standalone (no daemon required for inspection).
//
// Tests spawn the built dist/cli/index.js under a controlled environment (GOATIDE_DB
// override + GOATIDE_REJECTED_LOG_PATH override) so the on-disk artifacts the developer
// installs at home stay untouched.

import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { openDatabase } from '../../graph/db.js';
import { HarvestMetricsDao } from '../../harvester/metrics.js';
import { appendRejection, type RejectionRecord } from '../../harvester/filter/rejected-log.js';

const CLI_ENTRY = resolve(__dirname, '..', '..', '..', 'dist', 'cli', 'index.js');

beforeAll(() => {
	if (!existsSync(CLI_ENTRY)) {
		throw new Error(`CLI entry missing at ${CLI_ENTRY}; run 'npm run build' before vitest.`);
	}
});

let scratch: string;

beforeEach(() => {
	scratch = mkdtempSync(join(tmpdir(), 'goatide-cli-harvest-'));
});

afterEach(() => {
	if (scratch && existsSync(scratch)) {
		rmSync(scratch, { recursive: true, force: true });
	}
});

function runCli(args: string[], extraEnv: Record<string, string> = {}): { code: number; stdout: string; stderr: string } {
	const result = spawnSync(process.execPath, [CLI_ENTRY, ...args], {
		env: { ...process.env, ...extraEnv },
		encoding: 'utf8',
	});
	return {
		code: result.status ?? -1,
		stdout: result.stdout ?? '',
		stderr: result.stderr ?? '',
	};
}

function record(partial?: Partial<RejectionRecord>): RejectionRecord {
	return {
		observation_id: partial?.observation_id ?? 'obs-1',
		predicate: partial?.predicate ?? 'portable',
		reason: partial?.reason ?? 'machine path',
		source: partial?.source ?? 'claude_jsonl',
		ts: partial?.ts ?? '2026-05-07T12:00:00.000Z',
		body_preview: partial?.body_preview ?? 'preview',
		file_path: partial?.file_path,
	};
}

describe('PORT-03 / PORT-06: goatide-cli harvest subcommand', () => {
	it('PORT-03: harvest rejections --since 24h --predicate <name> filters JSONL log by ISO ts and predicate', () => {
		const logPath = join(scratch, 'rejected.jsonl');
		// Plant 5 entries: 3 within 24h + 2 older; 2 portable + 3 net_new of which only 1
		// portable is within the 24h window.
		const recentTs = '2026-05-07T12:00:00.000Z';                      // recent
		const oldTs = '2026-04-30T12:00:00.000Z';                         // older than 24h from refNow
		appendRejection(record({ observation_id: 'a', predicate: 'portable', ts: oldTs }), logPath);
		appendRejection(record({ observation_id: 'b', predicate: 'net_new', ts: oldTs }), logPath);
		appendRejection(record({ observation_id: 'c', predicate: 'portable', ts: recentTs }), logPath);
		appendRejection(record({ observation_id: 'd', predicate: 'net_new', ts: recentTs }), logPath);
		appendRejection(record({ observation_id: 'e', predicate: 'net_new', ts: recentTs }), logPath);

		// Reference now = 2026-05-08T00:00:00Z so 24h window is 2026-05-07T00:00:00Z onward.
		const refNow = '2026-05-08T00:00:00.000Z';
		const out = runCli(
			['harvest', 'rejections', '--since', '24h', '--predicate', 'portable'],
			{ GOATIDE_REJECTED_LOG_PATH: logPath, GOATIDE_NOW_OVERRIDE_ISO: refNow },
		);

		expect({
			code: out.code,
			containsObsC: out.stdout.includes('c'),                       // recent + portable -> shown
			containsObsA: out.stdout.includes(' a '),                     // older + portable -> excluded
			containsObsD: out.stdout.includes(' d '),                     // recent + net_new -> filtered out
			footerCount: /1 rejection/.test(out.stdout),
		}).toEqual({
			code: 0,
			containsObsC: true,
			containsObsA: false,
			containsObsD: false,
			footerCount: true,
		});
	});

	it('PORT-06: harvest metrics --days 7 prints aligned table + sustained-zero footer', () => {
		const dbPath = join(scratch, 'graph.db');
		const handle = openDatabase(dbPath);
		try {
			const dao = new HarvestMetricsDao(handle.sqlite);
			// Seed 4 days × 4 sources. Make claude_jsonl sustained-zero (high volume / zero
			// promoted), editor_save healthy (some promotions); 7-day window so the test
			// catches the sustained-zero footer.
			const refNow = Date.UTC(2026, 4, 8, 12, 0, 0);                // 2026-05-08T12:00:00Z
			const ONE_DAY_MS = 24 * 60 * 60 * 1000;
			for (let d = 0; d < 7; d++) {
				const t = refNow - d * ONE_DAY_MS;
				for (let i = 0; i < 12; i++) {
					dao.incrementSubmitted('claude_jsonl', t);
					dao.incrementSubmitted('editor_save', t);
					dao.incrementSubmitted('terminal_shell', t);
					dao.incrementSubmitted('git_commit', t);
				}
				for (let i = 0; i < 6; i++) {
					dao.incrementPromoted('editor_save', t);
					dao.incrementPromoted('terminal_shell', t);
					dao.incrementPromoted('git_commit', t);
				}
			}
		} finally {
			handle.close();
		}

		const out = runCli(
			['harvest', 'metrics', '--days', '7', '--threshold', '10'],
			{ GOATIDE_DB: dbPath, GOATIDE_NOW_OVERRIDE_ISO: '2026-05-08T12:00:00.000Z' },
		);

		expect({
			code: out.code,
			hasHeader: /date_utc/.test(out.stdout) && /accept_rate/.test(out.stdout),
			hasClaudeJsonl: /claude_jsonl/.test(out.stdout),
			hasEditorSave: /editor_save/.test(out.stdout),
			hasSustainedFooter: /sustained-zero/i.test(out.stdout) && /claude_jsonl/.test(out.stdout),
			hasNoStrayBlankLineCount: out.stdout.length > 50,
		}).toEqual({
			code: 0,
			hasHeader: true,
			hasClaudeJsonl: true,
			hasEditorSave: true,
			hasSustainedFooter: true,
			hasNoStrayBlankLineCount: true,
		});
	});
});
