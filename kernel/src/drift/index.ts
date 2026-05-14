/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/drift/index.ts — Phase 7 drift subsystem public surface.
//
// MERGE NOTE (Plans 07-02 + 07-03 parallel): Both plans contribute to this file via the
// append-after-block convention. Plan 07-03 (DRIFT-03) re-exports parseSections,
// detectsContractLock, SectionRange, LockTrigger, ContractNodeRecord, ContractRegistry.
// Plan 07-02 (DRIFT-01) appends runDriftDetector, loadContractRegistry, DriftFinding,
// PatternEntry, DriftPattern (re-export from payloads). When both plans land, the merged
// file contains all re-exports; consumers (Plan 07-04 + 07-07) import the union from this
// single entry point.

// Plan 07-03 (DRIFT-03) — section-parser + lock-detector public surface.
export { parseSections } from './section-parser.js';
export type { SectionRange } from './section-parser.js';
export { detectsContractLock } from './lock-detector.js';
export type { LockDetectorInput } from './lock-detector.js';
export type { LockTrigger, ContractNodeRecord, ContractRegistry } from './types.js';

// Plan 07-02 (DRIFT-01) — pattern detector + contract registry public surface.
export { runDriftDetector } from './detector.js';
export type { DriftDetectorInput } from './detector.js';
export { loadContractRegistry } from './registry.js';
export { evalRegexPattern, evalJsonpathPattern, evalForbiddenImport } from './patterns.js';
export type { AddedLine } from './patterns.js';
export type { DriftFinding, PatternEntry } from './types.js';
export { DriftPattern } from '../graph/payloads.js';
export type { DriftPatternT } from '../graph/payloads.js';

// Plan 07-05 (DRIFT-02) — IntentDrift evaluator public surface.
// Plan 14-03 (DEEP-04) — evaluateHistoricalConflict additive export.
export { evaluateIntentDrift, evaluateHistoricalConflict, type EvaluateIntentDriftInput, type EvaluateHistoricalConflictInput } from './intent.js';
export type { IntentDriftBadge } from './types.js';

// Plan 07-04 (DRIFT-04 + DRIFT-05) — ripple analyzer + progressive-disclosure public surface.
export { runRippleAnalysis } from './ripple.js';
export type { RunRippleAnalysisInput } from './ripple.js';
export { runRippleProgressive } from './ripple-progressive.js';
export type { RunRippleProgressiveInput } from './ripple-progressive.js';
export type { ComplianceReport, ComplianceRow } from './types.js';
export { ComplianceReportSchema, ComplianceRowSchema } from './types.js';
