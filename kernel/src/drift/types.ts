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

import { z } from 'zod';
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

// =============================================================================================
// Plan 07-04 (DRIFT-04 + DRIFT-05) — ComplianceReport tri-bucket ripple analysis surface.
// =============================================================================================
//
// runRippleAnalysis (kernel/src/drift/ripple.ts) returns a ComplianceReport classifying
// downstream-reachable nodes into a constitutional tri-bucket per the FIRST edge kind in
// each node's edge_path:
//   - 'protects' → definitely_affected
//   - 'references' / 'parent_of' → potentially_affected
//   - 'derived_from' / 'supersedes' / 'unknown' → OMITTED (audit-trail edges; UI shows
//     'no other reachable nodes' rather than enumerating)
//
// The 3-hop cap is a constitutional pin (Pitfall 4 + DRIFT-05): max_hops is a TypeScript
// literal-union (1 | 2 | 3) so callers cannot widen at compile time, AND the
// refuse-unbounded-ripple-walk.sh CI gate static-greps the ripple*.ts source for
// `max_hops:` literals exceeding 3. Both layers must agree.
//
// ComplianceReportSchema is exported as a real Zod schema so Plan 07-07 (bridge save-gate)
// can re-validate the response shape at the IPC boundary.

/**
 * One classified row in a ComplianceReport. The `hops` value is bounded by the literal-union
 * max_hops (so .min(1).max(3) on the Zod schema matches the constitutional cap).
 */
export const ComplianceRowSchema = z.object({
	node_id: z.string(),
	kind: z.enum(['ConstraintNode', 'DecisionNode', 'ContractNode', 'OpenQuestion', 'Attempt']),
	anchor_file: z.string().optional(),
	edge_path: z.string(),
	hops: z.number().int().min(1).max(3),
	body_preview: z.string(),
});

/**
 * Tri-bucket compliance report for a ContractNode's downstream blast radius.
 *
 * @property contract_node_id      Source ContractNode ULID (the seed of the BFS walk).
 * @property max_hops              Literal cap used for this report (1 | 2 | 3).
 * @property definitely_affected   Rows reached via a 'protects' first edge.
 * @property potentially_affected  Rows reached via a 'references' or 'parent_of' first edge.
 * @property truncated             True when the BFS yielded > nodeCap rows and we capped.
 * @property generated_at          ISO timestamp when the report was generated.
 *
 * The unaffected bucket is OMITTED by design — the bridge UI shows
 * 'no other reachable nodes' rather than enumerating audit-trail edges.
 */
export const ComplianceReportSchema = z.object({
	contract_node_id: z.string(),
	max_hops: z.union([z.literal(1), z.literal(2), z.literal(3)]),
	definitely_affected: z.array(ComplianceRowSchema),
	potentially_affected: z.array(ComplianceRowSchema),
	truncated: z.boolean(),
	generated_at: z.string(),
});

export type ComplianceRow = z.infer<typeof ComplianceRowSchema>;
export type ComplianceReport = z.infer<typeof ComplianceReportSchema>;

// =============================================================================================
// Plan 07-05 (DRIFT-02) — IntentDrift badge surface.
// =============================================================================================
//
// evaluateIntentDrift (kernel/src/drift/intent.ts) compares each cited DecisionNode's
// derived_under_priority against the active session priority. A mismatch produces an
// IntentDriftBadge that decorates the matching RenderedCitation. Plan 07-07 renders the
// badge via CitationList.tsx (icon + click-to-modal explanation).
//
// Mandate-C exact-equality (Pitfall 5): 'Quality' !== 'Quality-First'. The constitutional
// pin is enforced at the unit-test level — a refactor that introduces prefix-match silently
// is rejected by the failing test in kernel/src/test/drift/intent.spec.ts.

/**
 * IntentDrift badge — emitted when a cited DecisionNode's derived_under_priority does NOT
 * exact-match the active session priority. Decorates RenderedCitation.intent_drift_badge.
 *
 * @property citation_node_id The cited node's ULID (== RenderedCitation.node_id).
 * @property session_priority The active session priority at evaluation time.
 * @property cited_priority   The DecisionNode's derived_under_priority (the rule-author's
 *                            stated optimization context at the time the rule was authored).
 * @property explanation      Templated human-readable string for tooltip / modal display.
 */
export interface IntentDriftBadge {
	readonly citation_node_id: string;
	readonly session_priority: string;
	readonly cited_priority: string;
	readonly explanation: string;
}
