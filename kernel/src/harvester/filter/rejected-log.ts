/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/filter/rejected-log.ts — Phase 5 Plan 05-05 PORT-03.
//
// Rejected-observation JSONL log. PORT-02 says rejection is SILENT — no UI, no graph
// write — but PORT-03 says rejection must remain CLI-inspectable so the developer can
// audit why the filter ate something. This module is the auditable surface: every
// reject path (credential_scrub through justified) calls appendRejection; Plan 05-07
// wires `goatide-cli harvest rejections` over readRejections.
//
// Rotation strategy: 64MB ring of two backup files. When the active log crosses the
// threshold, .log.2 is dropped (or .1 -> .2 first), .log.1 -> .log.2, .log -> .log.1.
// The active .log starts fresh on the next append. No concurrent-writer race because
// every observation funnels through a single kernel daemon process (Plan 05-02 lockfile).

import {
	appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync,
} from 'node:fs';
import { dirname } from 'node:path';

/** Default rotation threshold — 64MB ring per ## Pattern: Rejected-Observation Log. */
export const MAX_REJECTED_LOG_BYTES = 64 * 1024 * 1024;

/**
 * One JSONL entry. observation_id traces back through the harvester pipeline; predicate
 * + reason support `goatide-cli harvest rejections --predicate verifiable` filtering;
 * source + file_path support per-source aggregation; body_preview is first 200 chars of
 * the observation body so audit doesn't leak full credential text (the 5 patterns in
 * credential-scrub.ts catch most secrets pre-log, but body_preview is an extra safety
 * net — even on a credential_scrub reject, only 200 chars of context land on disk).
 */
export interface RejectionRecord {
	observation_id: string;
	predicate: string;
	reason: string;
	source: string;
	ts: string;
	body_preview: string;
	file_path?: string;
}

/**
 * Append one rejection record to the log. Creates parent directory if missing. Rotates
 * lazily AFTER the append so we never lose the line that triggered rotation.
 */
export function appendRejection(rec: RejectionRecord, path: string): void {
	mkdirSync(dirname(path), { recursive: true });
	appendFileSync(path, JSON.stringify(rec) + '\n', 'utf8');
	rotateIfNeeded(path, MAX_REJECTED_LOG_BYTES);
}

/**
 * Read all rejection records, optionally filtered by ISO-timestamp lower bound and/or
 * predicate. Reads the active log only; .1/.2 backups stay opaque to the CLI (Plan 05-07
 * decision — backups are for incident archaeology, not routine `--since 24h` queries).
 */
export function readRejections(
	filter: { since?: string; predicate?: string },
	path: string,
): RejectionRecord[] {
	if (!existsSync(path)) {
		return [];
	}
	const text = readFileSync(path, 'utf8');
	const out: RejectionRecord[] = [];
	for (const line of text.split('\n')) {
		if (line.length === 0) {
			continue;
		}
		let parsed: RejectionRecord;
		try {
			parsed = JSON.parse(line) as RejectionRecord;
		} catch {
			// Corrupt line — skip without failing the read.
			continue;
		}
		if (filter.since && parsed.ts < filter.since) {
			continue;
		}
		if (filter.predicate && parsed.predicate !== filter.predicate) {
			continue;
		}
		out.push(parsed);
	}
	return out;
}

/**
 * Rotate when the active log exceeds the threshold. Visible for testing — production
 * callers go through appendRejection.
 *
 * Rotation order:
 *   1. If .log.2 exists, drop it (cap is 2 backups).
 *   2. If .log.1 exists, rename to .log.2.
 *   3. Rename active .log to .log.1.
 *
 * After rotation the active path no longer exists; the next appendFileSync recreates it.
 */
export function rotateIfNeeded(path: string, maxBytes: number): void {
	if (!existsSync(path)) {
		return;
	}
	const size = statSync(path).size;
	if (size < maxBytes) {
		return;
	}
	const path1 = path + '.1';
	const path2 = path + '.2';
	if (existsSync(path2)) {
		unlinkSync(path2);
	}
	if (existsSync(path1)) {
		renameSync(path1, path2);
	}
	renameSync(path, path1);
}
