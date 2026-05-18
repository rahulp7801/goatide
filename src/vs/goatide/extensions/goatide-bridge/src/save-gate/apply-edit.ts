/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Bridge atomic file write — Plan 04-05.
//
// RESEARCH ## Atomicity Strategy: DB-first + atomic-rename file write. The bridge
// stages content into <target>.goat-staging-<ulid>, fsyncs the staging file, calls
// kernel.atomicAccept (DB transaction), then renames staging → target and fsyncs the
// parent dir. On any error the staging file is unlinked. The ordering is justified
// inline below (recovery semantics).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { ulid } from 'ulid';
import type { KernelClient } from '../kernel/client.js';

export interface AcceptParams {
	target_path: string;
	new_content: string;
	change_id: string;
	receipt_id: string;
	tier: 'silent' | 'inline' | 'modal';
	accept_latency_ms: number;
	body: string;        // Attempt body — short summary
	anchor: { file?: string; symbol?: string; line?: number; ticket_id?: string };
	// Phase 21 XREPO-01 -- workspace-level scoping; default 'primary'.
	repo_id?: string;
}

/**
 * RESEARCH ## Atomicity Strategy: DB-first + atomic-rename file write.
 * Sequence: write staging → fsync → kernel.atomicAccept (DB tx) → rename → fsync parent.
 * On error: cleanup staging file.
 *
 * ORDERING JUSTIFICATION (RESEARCH wording was imprecise; this is the chosen and correct
 * ordering for crash-recovery):
 *
 *   The DB transaction commits BEFORE the file rename. A crash between the kernel's
 *   atomicAccept COMMIT and the local fs.renameSync therefore leaves a state where
 *   (DB says: Attempt accepted; staging file: present at staging_path; target file: NOT
 *   yet renamed). The recovery scan (recovery-scan.ts) handles this:
 *
 *     - Walks the workspace for orphan `.goat-staging-*` files
 *     - For each, calls kernel.queryAttemptByStagingPath to see if an accepted Attempt
 *       points at this staging file
 *     - If yes (accepted): re-runs the rename idempotently. The staging file's content
 *       was already fsynced before the DB commit, so the data is durable. The Attempt
 *       row carries target_path, so the rename target is unambiguous.
 *     - If no (Attempt missing): the DB transaction never committed; unlink the staging
 *       file as garbage.
 *
 *   This ordering trades a slightly larger crash window (DB-says-yes-but-file-not-yet)
 *   for a clean recovery path. The reverse ordering (rename first, then DB COMMIT) would
 *   leave a state where (file: renamed; DB: no Attempt) which is ALSO recoverable but
 *   harder to disambiguate from "user manually moved a file outside the gate" - we'd
 *   need filesystem inotify to know which files we wrote ourselves. The chosen ordering
 *   keeps the staging-file presence as a positive signal that the bridge owns this write.
 *
 *   Idempotency: re-running the rename with content-hash equality is safe. The Attempt
 *   row should carry payload.staging_content_sha256 so the recovery scan can verify the
 *   staging file is byte-identical to what was committed before completing the rename.
 *   (For Phase-4 v1 we trust the staging filename's ULID uniqueness; sha256 lands as a
 *   Phase-4-iter hardening note.)
 */
export async function applyEditAtomically(params: AcceptParams, kernel: KernelClient): Promise<{ attempt_node_id: string }> {
	const targetPath = params.target_path;
	const stagingPath = `${targetPath}.goat-staging-${ulid()}`;

	// Phase 1: write + fsync staging file.
	// Use openSync('w')+writeSync+fsyncSync rather than writeFileSync+separate-open: on Windows
	// fsync on a read-only fd raises EPERM. Writing through an open fd lets us fsync the same
	// fd that wrote the bytes — POSIX-compliant + Windows-compatible.
	const stagingFd = fs.openSync(stagingPath, 'w');
	try {
		fs.writeSync(stagingFd, params.new_content, 0, 'utf8');
		try {
			fs.fsyncSync(stagingFd);
		} catch {
			// Some filesystems (e.g. Windows shares, network mounts) reject fsync on data files.
			// The os will still flush eventually; the rename below is the durability boundary.
		}
	} finally {
		try { fs.closeSync(stagingFd); } catch { /* ignore */ }
	}

	let result;
	try {
		// Phase 2: kernel runs the DB-side transaction.
		result = await kernel.atomicAccept({
			change_id: params.change_id,
			receipt_id: params.receipt_id,
			tier: params.tier,
			accept_latency_ms: params.accept_latency_ms,
			staging_path: stagingPath,
			target_path: targetPath,
			body: params.body,
			anchor: params.anchor,
			repo_id: params.repo_id ?? 'primary',   // Phase 21 XREPO-01
		});

		// Phase 3: rename — POSIX-atomic; Windows-atomic on NTFS via MoveFileEx.
		fs.renameSync(stagingPath, targetPath);

		// Phase 4: fsync the parent directory (RESEARCH ## Pitfall 4 — write-file-atomic Issue #64).
		// On Windows, fsync on a directory fd is a no-op / unsupported; tolerate failure.
		try {
			const parentFd = fs.openSync(path.dirname(targetPath), 'r');
			try {
				fs.fsyncSync(parentFd);
			} finally {
				try { fs.closeSync(parentFd); } catch { /* ignore */ }
			}
		} catch {
			// Windows: directory fsync is not supported; rename durability comes from fs.renameSync
			// + the staging file's prior fsync. POSIX still benefits from the parent fsync above.
		}
	} catch (e) {
		// Cleanup staging on any failure (DB rollback OR rename failure OR fsync failure).
		try { fs.unlinkSync(stagingPath); } catch { /* ignore */ }
		throw e;
	}

	return { attempt_node_id: result.attempt_node_id };
}
