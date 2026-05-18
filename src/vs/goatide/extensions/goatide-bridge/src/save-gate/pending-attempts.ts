/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Bridge PendingAttemptsQueue — Plan 04-06 (CANV-10).
//
// JSONL-backed pending-attempts queue. Used by the kernel-degraded save path: when the
// kernel sidecar is unreachable, the bridge writes the file directly + appends an Attempt
// record here for replay on reconnect.
//
// Storage: <workspaceRoot>/.goatide/pending-attempts.jsonl. JSONL has line-as-record
// semantics — a complete line is a complete record. fs.promises.appendFile writes via a
// single syscall when the buffer &lt;= pipe size; for typical Attempt records (~500 bytes)
// this IS atomic in practice. The drain pass tolerates parse errors by skipping bad
// lines, so a crash mid-append leaves a half-written line that drainAll discards.
//
// Drain replays each record via kernel.atomicAccept; on full success the queue file is
// unlinked. On partial success (some replays failed) the file is LEFT in place — the
// remaining good records will be re-read + re-replayed on the next drain. This means
// replays MAY duplicate if the IDE is killed mid-drain (kernel-side committed Attempts
// that the bridge didn't see). Phase-4-iter mitigation: kernel-side idempotency on
// (change_id, target_path) — see plan output carryover note.
//
// RESEARCH 04-RESEARCH.md ## Pattern: Kernel-Degraded Mode — `.goatide/pending-attempts.jsonl`.

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import type { KernelClient } from '../kernel/client.js';

export interface PendingAttemptRecord {
	/** Null in degraded path — no staging file (we wrote directly to target_path). */
	staging_path: string | null;
	target_path: string;
	change_id: string;
	/** Null if proposeEdit failed (kernel was already down when the diff was captured). */
	receipt_id: string | null;
	/**
	 * Plan 04-04 wire tier is 'silent' | 'inline' | 'modal'. The 'kernel_degraded' value is
	 * a virtual tier that only lives in this queue; drainAll replays it as 'silent' since
	 * the developer never saw a Canvas in degraded mode.
	 */
	tier: 'silent' | 'inline' | 'modal' | 'kernel_degraded';
	accept_latency_ms: number;
	body: string;
	anchor: { file?: string; symbol?: string; line?: number; ticket_id?: string };
	/** ISO-8601 timestamp captured at appendAttempt time (for forensics). */
	queued_at: string;
	/**
	 * Phase 21 XREPO-01 -- repo_id of the workspace folder at queue time.
	 * Optional for backward compat: pre-Phase-21 queued records lack this field.
	 * drainAll defaults to 'primary' when absent (Pitfall E mitigation).
	 */
	repo_id?: string;
}

export interface DrainReport {
	drained: number;
	failed: number;
	total: number;
}

export class PendingAttemptsQueue {
	private readonly filePath: string;

	constructor(workspaceRoot: string) {
		this.filePath = path.join(workspaceRoot, '.goatide', 'pending-attempts.jsonl');
	}

	get path(): string {
		return this.filePath;
	}

	/**
	 * Atomically append a single record (one JSONL line ending in \n). Creates the
	 * .goatide/ parent dir on first call. fs.promises.appendFile is a single syscall on
	 * typical Attempt-record sizes — sufficient for v1.
	 */
	async appendAttempt(record: PendingAttemptRecord): Promise<void> {
		const dir = path.dirname(this.filePath);
		await fsp.mkdir(dir, { recursive: true });
		const line = JSON.stringify(record) + '\n';
		await fsp.appendFile(this.filePath, line, 'utf8');
	}

	/**
	 * Read all queued records, tolerating per-line parse errors (a half-written line from
	 * a crash is dropped silently). Returns [] if the queue file does not exist.
	 */
	async readAll(): Promise<PendingAttemptRecord[]> {
		let raw: string;
		try {
			raw = await fsp.readFile(this.filePath, 'utf8');
		} catch {
			return [];
		}
		const out: PendingAttemptRecord[] = [];
		for (const line of raw.split('\n')) {
			if (line.trim().length === 0) {
				continue;
			}
			try {
				out.push(JSON.parse(line) as PendingAttemptRecord);
			} catch {
				// tolerate parse errors — a crash mid-append could leave a truncated line.
			}
		}
		return out;
	}

	/**
	 * Replay every queued record via kernel.atomicAccept (FIFO). On full success, deletes
	 * the queue file. On partial success, leaves the file in place — the remaining records
	 * will be re-read + re-replayed on the next drain.
	 */
	async drainAll(kernel: KernelClient): Promise<DrainReport> {
		const records = await this.readAll();
		let drained = 0;
		let failed = 0;
		for (const rec of records) {
			try {
				// Phase 21 XREPO-01 Pitfall E mitigation: if repo_id is absent (pre-Phase-21
				// queued record), default to 'primary' and log a warning so operators can identify
				// any records that predate the cross-repo audit trail.
				if (rec.repo_id === undefined) {
					console.warn('[goatide-bridge] pending-attempt replay missing repo_id; defaulting to primary (Pitfall E)');
				}
				await kernel.atomicAccept({
					change_id: rec.change_id,
					receipt_id: rec.receipt_id ?? '',
					tier: rec.tier === 'kernel_degraded' ? 'silent' : rec.tier,
					accept_latency_ms: rec.accept_latency_ms,
					staging_path: rec.staging_path ?? '',
					target_path: rec.target_path,
					body: rec.body,
					anchor: rec.anchor,
					repo_id: rec.repo_id ?? 'primary',   // Phase 21 XREPO-01
				});
				drained++;
			} catch (e) {
				console.error('[goatide-bridge] drainAll: replay failed', rec.change_id, e);
				failed++;
			}
		}
		// On full success (no replay failures, at least one drained), unlink the queue
		// file so the next drain sees an empty queue. Best-effort unlink: on Windows the
		// file may still be open in another handle (rare; surfaces under high contention)
		// and unlink raises EBUSY — treated as benign here, the next drain re-reads the
		// same records and the kernel-side idempotency would dedupe.
		if (failed === 0 && drained > 0) {
			try {
				fs.unlinkSync(this.filePath);
			} catch {
				// best-effort — Windows EBUSY tolerated.
			}
		}
		return { drained, failed, total: records.length };
	}
}
