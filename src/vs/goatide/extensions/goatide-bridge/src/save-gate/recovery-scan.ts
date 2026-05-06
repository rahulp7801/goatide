/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Bridge recovery scan — Plan 04-05.
//
// Walks the workspace for orphan `.goat-staging-*` files and reconciles them against the
// kernel's pending Attempts. Runs at extension activation BEFORE registerSaveGate so a
// previous-crash orphan doesn't multiply when the user re-saves the same file.

import * as vscode from 'vscode';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { KernelClient } from '../kernel/client.js';

export interface RecoveryReport {
	scanned: number;
	completed_renames: number;
	unlinked_orphans: number;
	left_alone: number;
}

/**
 * Walk the workspace for orphan `.goat-staging-*` files and reconcile them against the
 * kernel's pending Attempts. RESEARCH ## Pattern: Atomicity Strategy + ## Pitfall 7.
 *
 * Decision tree:
 *   - If a matching Attempt exists with attempt_kind === 'accepted' → complete the rename.
 *   - If no matching Attempt → DB rolled back (or never committed); unlink the staging file.
 *   - If matching Attempt exists with attempt_kind !== 'accepted' → leave alone (unexpected).
 *
 * Runs in &lt;=500ms in a typical workspace. Does NOT block activate (called via .catch in extension.ts).
 */
export async function scanForOrphanStagingFiles(
	_ctx: vscode.ExtensionContext,
	kernel: KernelClient,
): Promise<RecoveryReport> {
	const report: RecoveryReport = { scanned: 0, completed_renames: 0, unlinked_orphans: 0, left_alone: 0 };
	if (!kernel.isConnected()) {
		return report;
	}
	let uris: vscode.Uri[];
	try {
		uris = await vscode.workspace.findFiles('**/*.goat-staging-*');
	} catch {
		// findFiles requires a workspace; in tests without one it may throw.
		return report;
	}
	for (const uri of uris) {
		report.scanned++;
		const staging = uri.fsPath;
		try {
			const lookup = await kernel.queryAttemptByStagingPath({ staging_path: staging });
			if (!lookup.attempt_node_id) {
				try { fs.unlinkSync(staging); } catch { /* file gone */ }
				report.unlinked_orphans++;
				continue;
			}
			if (lookup.attempt_kind === 'accepted' && lookup.target_path) {
				try {
					fs.renameSync(staging, lookup.target_path);
					try {
						const parentFd = fs.openSync(path.dirname(lookup.target_path), 'r');
						try { fs.fsyncSync(parentFd); } finally { try { fs.closeSync(parentFd); } catch { /* ignore */ } }
					} catch {
						// Windows: directory fsync unsupported; tolerate.
					}
					report.completed_renames++;
				} catch (e) {
					console.error('[goatide-bridge] recovery: rename failed', staging, e);
					report.left_alone++;
				}
			} else {
				report.left_alone++;
			}
		} catch (e) {
			console.error('[goatide-bridge] recovery: lookup failed', staging, e);
			report.left_alone++;
		}
	}
	return report;
}
