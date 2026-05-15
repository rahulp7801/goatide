/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 16 Plan 16-02 DEEP-03 hypothetical-impact analyzer (Wave-0 stub).
//
// Read-only walk seeded from a ConstraintNode (NOT ContractNode — that's runRippleAnalysis).
// Reuses walkRippleEdges from ripple.ts (exported in Wave 0). Same SQL shape; different anchor.
// Wave-0 stub throws; Wave 1 (Plan 16-02) lands the real body.

import type Database from 'better-sqlite3';
import type { GraphDAO } from '../graph/dao.js';
import type { ComplianceReport, ComplianceRow } from './types.js';

export interface RunConstraintLiftInput {
	readonly constraintNodeId: string;
	readonly maxHops: 1 | 2 | 3;   // literal-union cap — refuse-unbounded-ripple-walk gate enforces
	readonly asOf: string;
	readonly confidenceThreshold?: number;  // 0.0..1.0; default 0.5 (Wave 1)
	readonly dao: GraphDAO;
	readonly sqlite: Database.Database;
	readonly nodeCap?: number;
}

export interface ConstraintLiftRow extends ComplianceRow {
	readonly confidence_band: 'explicit' | 'inferred';
}

export interface ConstraintLiftResult {
	readonly hypothetical_impact: ComplianceReport;
	readonly confidence_score: number;   // 0.0..1.0 aggregate
}

/**
 * Phase 16 Plan 16-02 DEEP-03 — Wave-0 throw-stub; Wave 1 GREEN-flips.
 * @throws Always — implement in Plan 16-02 Wave 1.
 */
export function runConstraintLiftAnalysis(_input: RunConstraintLiftInput): ConstraintLiftResult {
	throw new Error('Wave 1 implements - Plan 16-02');
}
