/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Wave-0 stub for CANV-06 + CANV-07 — bridge onWillSaveTextDocument cancel-and-redo
// + atomic accept (DB-first + atomic-rename + parent-fsync).
// Plan 04-04 implements both. The integration uses VS Code's @vscode/test-electron
// or a kernel-spawned mock — landing decision in Plan 04-04.

import { describe, it } from 'mocha';

describe('CANV-06 + CANV-07 — save gate cancel-and-redo + atomic accept', () => {
	it.skip('onWillSaveTextDocument vetoes the save then opens Canvas — Plan 04-04 has not yet implemented save gate', () => {
		// Stub. Plan 04-04.
	});
	it.skip('Accept atomically writes file via stage+rename + persists Attempt node — Plan 04-04 has not yet implemented applyEditAtomically', () => {
		// Stub. Plan 04-04.
	});
	it.skip('Crash between staging-fsync and DB COMMIT leaves no Attempt + no file change (DB-rollback) — Plan 04-04 has not yet implemented atomic accept', () => {
		// Stub. Plan 04-04.
	});
	it.skip('Recovery scan on activate cleans up orphan .goat-staging-* files — Plan 04-04 has not yet implemented recovery scan', () => {
		// Stub. Plan 04-04.
	});
});
