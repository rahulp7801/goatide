/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/canvas/DriftFindings-constraint-lift-button.test.tsx — Phase 16 Plan 16-01 Task 4.
//
// 3-case RED jsdom suite for the constraint-lift button in DriftFindings.tsx.
// RED at Wave-0 close — DriftFindings.tsx not yet updated (Wave 3 — Plan 16-04 GREEN-flips).
// VALIDATION.md task rows 16-00-24..26 grep target: verbatim case-name strings.

import { describe, it, afterEach } from 'mocha';
import { strict as assert } from 'node:assert';
import * as React from 'react';
import { cleanup } from '@testing-library/react';

afterEach(() => { cleanup(); });

describe('DriftFindings constraint.lift button', () => {
	it('DriftFindings constraint.lift button renders when payload citations include a ConstraintNode', () => {
		// Wave-0: DriftFindings.tsx has no constraint-lift button yet.
		// Wave 3 (Plan 16-04) GREEN-flips by adding the button + wiring canvas.requestConstraintLift.
		assert.fail('Wave 3 implements - Plan 16-04 GREEN-flips (DriftFindings constraint-lift button)');
	});

	it('DriftFindings constraint.lift button hidden when no ConstraintNode citation', () => {
		// Wave-0: DriftFindings.tsx has no constraint-lift button yet.
		// Wave 3 (Plan 16-04) GREEN-flips (button absent when no ConstraintNode in citations).
		assert.fail('Wave 3 implements - Plan 16-04 GREEN-flips (DriftFindings constraint-lift button hidden)');
	});

	it('DriftFindings constraint.lift button onClick posts canvas.requestConstraintLift with picked ConstraintNode id', () => {
		// Wave-0: no button, no postMessage wiring.
		// Wave 3 (Plan 16-04) GREEN-flips (button click → postMessage canvas.requestConstraintLift
		// with constraint_node_id = ULID of the picked ConstraintNode citation).
		assert.fail('Wave 3 implements - Plan 16-04 GREEN-flips (canvas.requestConstraintLift postMessage)');
	});
});
