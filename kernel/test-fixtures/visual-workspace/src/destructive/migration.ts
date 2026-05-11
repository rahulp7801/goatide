/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/test-fixtures/visual-workspace/src/destructive/migration.ts
//
// Visual-ceremony fixture (Phase 11 Plan 11-02). Benign baseline file. The harness
// `runVis02` injects a destructive SQL payload at runtime via in-buffer keyboard.type
// immediately before triggering the save, then restores this baseline after the
// assertion completes. The on-disk content here MUST remain destructive-free —
// see the "fixture preservation invariant" in 11-02-destructive-confirmation-PLAN.md.
// (The literal destructive verb is intentionally omitted from this comment so the
// fixture-preservation grep `! grep -q D R O P T A B L E` returns false on disk.)

export function placeholderMigration(): void {
	// Intentionally empty. Replaced at runtime by the visual-ceremony harness.
}
