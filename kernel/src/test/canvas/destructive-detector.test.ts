/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Wave-0 stub for CANV-08 — destructive-pattern detection.
// Plan 04-02 implements detectDestructive(diff, fileUri) and destructiveVerbForConfirmation(diff).

import { describe, it } from 'vitest';

describe('CANV-08 — destructive detection', () => {
	it.skip('rm -rf in diff is destructive — Plan 04-02 has not yet implemented detectDestructive', () => {});
	it.skip('DROP TABLE in diff is destructive — Plan 04-02 has not yet implemented destructive SQL patterns', () => {});
	it.skip('git revert in diff is destructive — Plan 04-02 has not yet implemented destructive git patterns', () => {});
	it.skip('migrations/*.sql path is destructive surface — Plan 04-02 has not yet implemented path-pattern destructive', () => {});
	it.skip('plain CREATE TABLE diff is NOT destructive — Plan 04-02 has not yet implemented non-destructive baseline', () => {});
	it.skip('confirmation-phrase verb echoes destructive verb (drop/delete/rm/revert) — Plan 04-02 has not yet implemented destructiveVerbForConfirmation', () => {});
});
