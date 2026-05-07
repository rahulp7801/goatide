/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/cli/commands/harvest.ts — Phase 5 Plan 05-07 PORT-03 + PORT-06 CLI surface.
//
// Two subcommands attached to `goatide-cli harvest`:
//
//   1. rejections [--since <ISO|24h|7d>] [--predicate <name>]
//      Reads ~/.config/goatide/rejected_observations.jsonl (env override
//      GOATIDE_REJECTED_LOG_PATH) and filters by ts + predicate. Prints one line per
//      record + footer count.
//
//   2. metrics [--days <N>] [--threshold <floor>]
//      Opens the kernel DB read-only via resolveDbPath() (env override GOATIDE_DB) and
//      prints (date_utc, source, submitted, rejected_by_filter, promoted_to_node,
//      accept_rate%) as a fixed-width ASCII table. Sustained-zero sources are flagged
//      in a footer warning block.
//
// Both subcommands work without a running daemon — they read from disk directly. The
// "connect to daemon if available" affordance is deferred to a future plan; the v1 surface
// is simple, deterministic, and shellable.

import type { Command } from 'commander';
import { Command as CommanderCommand } from 'commander';
import { readRejections } from '../../harvester/filter/rejected-log.js';
import { resolveRejectedLogPath } from '../../harvester/paths.js';
import { HarvestMetricsDao, DEFAULT_PORT06_DAYS, DEFAULT_PORT06_MIN_VOLUME, type HarvestMetricsRow } from '../../harvester/metrics.js';
import { openDatabase } from '../../graph/db.js';
import { resolveDbPath } from '../db-path.js';
import { formatError } from '../format.js';

/**
 * Register `harvest` and its two subcommands on the given parent. The parent is the top-level
 * `program` (mirrors `graph` registration) so the invocation is `goatide-cli harvest <sub>`,
 * not `goatide-cli graph harvest <sub>`.
 */
export function registerHarvestCommand(parent: Command): void {
	const harvest = parent.command('harvest').description('Inspect harvester telemetry');

	harvest.command('rejections')
		.description('Print rejected-observation log entries (filterable by ts and predicate)')
		.option('--since <duration>', 'ISO-8601 ts or relative duration (24h, 7d). Default 24h.', '24h')
		.option('--predicate <name>', 'Filter by predicate name (portable, net_new, ...)')
		.option('--log-path <path>', 'Override rejected-log path')
		.action((opts: { since: string; predicate?: string; logPath?: string }) => {
			try {
				const path = opts.logPath
					?? process.env.GOATIDE_REJECTED_LOG_PATH
					?? resolveRejectedLogPath();
				const nowMs = parseNowOverride();
				const sinceIso = resolveSinceArg(opts.since, nowMs);
				const records = readRejections(
					{ since: sinceIso, predicate: opts.predicate },
					path,
				);
				for (const rec of records) {
					const filePart = rec.file_path ? `  @ ${rec.file_path}` : '';
					const preview = rec.body_preview.length > 80
						? rec.body_preview.slice(0, 80) + '...'
						: rec.body_preview;
					process.stdout.write(
						`${rec.ts}  [${rec.predicate}]  ${rec.source}  ${rec.observation_id}  ${preview}${filePart}\n`,
					);
				}
				process.stdout.write(`\n${records.length} rejection${records.length === 1 ? '' : 's'} shown.\n`);
			} catch (e) {
				console.error(formatError(e, 'harvest rejections failed'));
				process.exit(1);
			}
		});

	harvest.command('metrics')
		.description('Print per-source daily accept-rate metrics dashboard')
		.option('--days <N>', 'Window size in days', String(DEFAULT_PORT06_DAYS))
		.option('--threshold <N>', 'Min daily volume floor for sustained-zero detection', String(DEFAULT_PORT06_MIN_VOLUME))
		.option('--db <path>', 'Database path override')
		.action((opts: { days: string; threshold: string; db?: string }) => {
			const days = Number.parseInt(opts.days, 10);
			const threshold = Number.parseInt(opts.threshold, 10);
			if (!Number.isFinite(days) || days <= 0) {
				console.error(formatError(new Error(`invalid --days: ${opts.days}`), 'harvest metrics failed'));
				process.exit(1);
			}
			if (!Number.isFinite(threshold) || threshold < 0) {
				console.error(formatError(new Error(`invalid --threshold: ${opts.threshold}`), 'harvest metrics failed'));
				process.exit(1);
			}
			const dbPath = resolveDbPath(opts.db ?? process.env.GOATIDE_DB);
			const handle = openDatabase(dbPath);
			try {
				const dao = new HarvestMetricsDao(handle.sqlite);
				const nowMs = parseNowOverride();
				const rows = dao.queryLastDays(days, nowMs);
				const sustained = dao.sustainedZeroSources({
					days,
					minDailyVolumeFloor: threshold,
					now: nowMs,
				});
				process.stdout.write(formatMetricsTable(rows, sustained, days, threshold));
			} catch (e) {
				console.error(formatError(e, 'harvest metrics failed'));
				process.exit(1);
			} finally {
				try { handle.close(); } catch { /* best-effort */ }
			}
		});
}

/**
 * Convert a relative `24h` / `7d` style duration OR an ISO-8601 timestamp into an absolute
 * ISO-8601 cutoff used by readRejections({since}). Reference 'now' is process.env
 * GOATIDE_NOW_OVERRIDE_ISO if set (test harness escape hatch), else Date.now.
 */
function resolveSinceArg(arg: string, nowMs: number): string {
	const relMatch = /^(\d+)([hdwm])$/.exec(arg);
	if (relMatch) {
		const value = Number.parseInt(relMatch[1], 10);
		const unit = relMatch[2];
		const unitMs = unit === 'h'
			? 60 * 60 * 1000
			: unit === 'd'
				? 24 * 60 * 60 * 1000
				: unit === 'w'
					? 7 * 24 * 60 * 60 * 1000
					: 30 * 24 * 60 * 60 * 1000;       // m = 30-day approx
		return new Date(nowMs - value * unitMs).toISOString();
	}
	// Treat as ISO-8601 — caller's responsibility if they pass garbage; readRejections
	// does a string compare so a mis-shaped value just filters everything out.
	return arg;
}

/** Read GOATIDE_NOW_OVERRIDE_ISO env (test harness) or fall back to Date.now(). */
function parseNowOverride(): number {
	const iso = process.env.GOATIDE_NOW_OVERRIDE_ISO;
	if (iso) {
		const ms = Date.parse(iso);
		if (Number.isFinite(ms)) {
			return ms;
		}
	}
	return Date.now();
}

/**
 * Format the metrics rows as a fixed-width ASCII table. Columns: date_utc, source,
 * submitted, rejected_by_filter, promoted_to_node, accept_rate%. Sustained-zero sources
 * land in a footer warning block; empty rows yields a "no data" notice instead of an
 * empty table.
 */
function formatMetricsTable(
	rows: HarvestMetricsRow[],
	sustainedZero: string[],
	days: number,
	threshold: number,
): string {
	const headers = ['date_utc', 'source', 'submitted', 'rejected_by_filter', 'promoted_to_node', 'accept_rate'];
	if (rows.length === 0) {
		return `harvest_metrics_daily: no rows in last ${days} days.\n`;
	}
	const formatted: string[][] = [headers];
	for (const r of rows) {
		const acceptRate = r.submitted === 0
			? '—'
			: `${((r.promoted_to_node / r.submitted) * 100).toFixed(2)}%`;
		formatted.push([
			r.date_utc,
			String(r.source),
			String(r.submitted),
			String(r.rejected_by_filter),
			String(r.promoted_to_node),
			acceptRate,
		]);
	}
	// Compute column widths.
	const widths: number[] = headers.map((h, i) => {
		let max = h.length;
		for (const row of formatted) {
			if (row[i].length > max) {
				max = row[i].length;
			}
		}
		return max;
	});
	const lines: string[] = [];
	for (const row of formatted) {
		const padded = row.map((cell, i) => cell.padEnd(widths[i], ' '));
		lines.push(padded.join('  '));
	}
	const sep = widths.map((w) => '-'.repeat(w)).join('  ');
	const out: string[] = [];
	out.push(lines[0]);
	out.push(sep);
	for (let i = 1; i < lines.length; i++) {
		out.push(lines[i]);
	}
	if (sustainedZero.length > 0) {
		out.push('');
		out.push(`WARNING: ${sustainedZero.length} sustained-zero source${sustainedZero.length === 1 ? '' : 's'} (last ${days} days, floor ${threshold}/day):`);
		for (const s of sustainedZero) {
			out.push(`  - ${s}`);
		}
		out.push('  These sources had volume but no observations promoted to graph nodes.');
		out.push('  Possible cause: misconfigured watcher, filter tuned too tight, or missing API key.');
	}
	return out.join('\n') + '\n';
}

/**
 * Standalone CLI smoke entry — only used via the registered subcommand path. Exposed so
 * tests can construct a tiny commander program in isolation if needed.
 */
export function makeStandaloneHarvestProgram(): Command {
	const program = new CommanderCommand();
	registerHarvestCommand(program);
	return program;
}
