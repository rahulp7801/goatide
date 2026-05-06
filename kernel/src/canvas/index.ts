/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/canvas/index.ts — Phase 4 (Plan 04-02) public surface for the canvas/ tree.
//
// Wave 1: types only. Wave-1 Tasks 2 + 3 add classifyTier + detectDestructive exports.

export {
	CanvasTierSchema,
	type CanvasTier,
	CanvasDecisionSchema,
	type CanvasDecision,
	type CitationDetail,
	type TierClassifierInputs,
} from './types.js';

export {
	detectDestructive,
	destructiveVerbForConfirmation,
	DESTRUCTIVE_DIFF_PATTERNS,
	DESTRUCTIVE_PATH_PATTERNS,
} from './destructive.js';
