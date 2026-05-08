/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/drift/types.ts — Phase 7 shared types for the drift subsystem.
//
// MERGE NOTE (Plans 07-02 + 07-03 parallel): Both plans contribute additive types to this
// file. Plan 07-02 (DRIFT-01) ships DriftFinding, ContractRegistry's allPatterns slot,
// PatternEntry. Plan 07-03 (DRIFT-03) ships LockTrigger and the ContractNodeRecord shape
// (which Plan 07-02 also references). The types declared below are designed to be a strict
// subset that Plan 07-02 may extend without breaking Plan 07-03's lock-detector. If Plan
// 07-02 lands first, its richer ContractRegistry interface (with allPatterns: PatternEntry[])
// is compatible with Plan 07-03's consumer (which only reads byPath).

import type { z } from 'zod';
import type { ContractPayload } from '../graph/payloads.js';

type ContractPayloadT = z.infer<typeof ContractPayload>;

/**
 * One ContractNode loaded from the graph + indexed by the registry. Both Plan 07-02
 * (pattern detector) and Plan 07-03 (lock detector) consume this shape.
 *
 * @property id      The ContractNode's ULID (graph-side).
 * @property payload The Zod-parsed ContractPayload (with patterns + enforcing_sections).
 */
export interface ContractNodeRecord {
	readonly id: string;
	readonly payload: ContractPayloadT;
}

/**
 * Drift finding emitted by the pattern detector (Plan 07-02). Plan 07-03's lock detector
 * does NOT emit DriftFinding — it emits LockTrigger. Plan 07-07 wires both into the bridge
 * save-gate (DriftFindings panel + ComplianceReport panel).
 *
 * Reserved for Plan 07-02 to populate; Plan 07-03 declares the shape so the file compiles
 * even when both plans are landing in parallel.
 */
export interface DriftFinding {
	readonly contract_node_id: string;
	readonly contract_anchor_file: string;
	readonly pattern_index: number;
	readonly pattern_kind: 'regex' | 'jsonpath' | 'forbidden_import';
	readonly file: string;
	readonly hunk_line: number;
	readonly message: string;
}

/**
 * One pattern entry indexed by the registry. Plan 07-02 (DRIFT-01) populates allPatterns;
 * Plan 07-03 does not consume this slot (lock detection is line-range driven, not
 * pattern-driven), but the shape is here so the registry interface is single-source.
 */
export interface PatternEntry {
	readonly contractNodeId: string;
	readonly pattern: import('../graph/payloads.js').DriftPatternT;
	readonly contractAnchorFile: string;
	readonly patternIndex: number;
}

/**
 * Contract registry — the per-save-dispatch index of all active ContractNodes. Plan 07-02's
 * loadContractRegistry() constructs it once per dispatch; Plan 07-03's detectsContractLock()
 * consumes it (reading only byPath).
 */
export interface ContractRegistry {
	readonly byPath: Map<string, ContractNodeRecord>;
	readonly byId: Map<string, ContractNodeRecord>;
	readonly allPatterns: PatternEntry[];
}

/**
 * Lock trigger emitted by Plan 07-03's detectsContractLock when a diff hunk overlaps any
 * enforcing-section line range of a registered contract. First match wins; deterministic
 * across repeated invocations because parsePatch result + Map iteration order are stable.
 *
 * Plan 07-04 (ripple analyzer) consumes LockTrigger.contract_node_id as the seed for the
 * 3-hop blast-radius walk. Plan 07-07 (bridge save-gate) escalates to modal tier when a
 * non-null LockTrigger appears in the canvas dispatch result.
 *
 * @property contract_node_id     The triggering ContractNode's ULID.
 * @property contract_anchor_file The contract's anchor file path (== contractRegistry.byPath key).
 * @property section_name         The enforcing-section name whose range overlapped the hunk.
 * @property edited_line_range    [hunk.newStart, hunk.newStart + hunk.newLines - 1].
 * @property hunk_index           0-based index of the triggering hunk within the parsed file's hunks array.
 */
export interface LockTrigger {
	readonly contract_node_id: string;
	readonly contract_anchor_file: string;
	readonly section_name: string;
	readonly edited_line_range: readonly [number, number];
	readonly hunk_index: number;
}
