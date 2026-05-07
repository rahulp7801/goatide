/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/filter/rejected-log.spec.ts — Phase 5 Plan 05-05 PORT-03.
//
// Plan 05-05 flips the first two it() blocks; Plan 05-07 flips the CLI test alongside its
// goatide-cli harvest rejections command.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	appendRejection,
	readRejections,
	rotateIfNeeded,
	type RejectionRecord,
} from '../../../harvester/filter/rejected-log.js';

let scratch: string;

beforeEach(() => {
	scratch = mkdtempSync(join(tmpdir(), 'goatide-rejected-log-'));
});

afterEach(() => {
	if (scratch && existsSync(scratch)) {
		rmSync(scratch, { recursive: true, force: true });
	}
});

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

describe('PORT-03: rejected-observation log', () => {
	it('appendRejection writes JSONL line and readRejections returns parsed entries in order', () => {
		const path = join(scratch, 'rejected.jsonl');
		appendRejection(record({ observation_id: 'a' }), path);
		appendRejection(record({ observation_id: 'b', predicate: 'verifiable' }), path);
		appendRejection(record({ observation_id: 'c', predicate: 'portable' }), path);

		const all = readRejections({}, path);
		const filtered = readRejections({ predicate: 'portable' }, path);

		expect({
			allCount: all.length,
			ids: all.map((r) => r.observation_id),
			predicates: all.map((r) => r.predicate),
			filteredCount: filtered.length,
			filteredIds: filtered.map((r) => r.observation_id),
		}).toEqual({
			allCount: 3,
			ids: ['a', 'b', 'c'],
			predicates: ['portable', 'verifiable', 'portable'],
			filteredCount: 2,
			filteredIds: ['a', 'c'],
		});
	});

	it('log rotates at MAX_REJECTED_LOG_BYTES threshold to .1/.2; .3 dropped', () => {
		const path = join(scratch, 'rejected.jsonl');
		// Use a tiny override threshold so we don't have to spool 64MB.
		const tinyMax = 256;

		// Stage 1: write enough lines to push the active log past tinyMax, then rotate.
		const filler = 'x'.repeat(80);
		writeFileSync(path, filler + '\n' + filler + '\n' + filler + '\n' + filler + '\n', 'utf8');
		expect(statSync(path).size).toBeGreaterThan(tinyMax);
		rotateIfNeeded(path, tinyMax);
		// After rotation: .log is gone (or fresh), .log.1 holds the previous content.
		expect(existsSync(path + '.1')).toBe(true);

		// Stage 2: write again and rotate; .log.1 -> .log.2.
		writeFileSync(path, filler + '\n' + filler + '\n' + filler + '\n' + filler + '\n', 'utf8');
		rotateIfNeeded(path, tinyMax);
		expect(existsSync(path + '.1')).toBe(true);
		expect(existsSync(path + '.2')).toBe(true);

		// Stage 3: third rotation — .log.3 would be created but we drop it (cap is 2).
		writeFileSync(path, filler + '\n' + filler + '\n' + filler + '\n' + filler + '\n', 'utf8');
		rotateIfNeeded(path, tinyMax);
		expect(existsSync(path + '.1')).toBe(true);
		expect(existsSync(path + '.2')).toBe(true);
		expect(existsSync(path + '.3')).toBe(false);
	});

	it.skip('CLI goatide-cli harvest rejections --since 24h --predicate portable filters log', () => {
		throw new Error('Plan 05-07 has not yet implemented goatide-cli harvest rejections');
	});
});
