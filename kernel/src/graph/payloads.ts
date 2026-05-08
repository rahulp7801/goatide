/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/graph/payloads.ts — Phase 2 (Plan 02-03) Zod-validated payload schemas.
//
// The TypeScript boundary above the SQLite CHECK layer. Every node payload that enters
// the DAO is parsed through NodePayloadSchema; any failure (Ghosting, missing body,
// unknown kind) throws ZodError BEFORE we ever open a transaction. SQL CHECKs are the
// defense-in-depth backstop for raw-SQL bypass paths (tests, future migrations).
//
// Per 02-RESEARCH.md ## Pattern: Discriminated-Union Payloads via Zod and ## Pattern:
// Ghosting-Rule Enforcement.
//
// Optional-field rationale: Phase-2 success criterion #1 names only `--kind` and `--body`.
// The optional fields (anchor, derived_under_priority, contract_path, attempt_kind) are
// scaffolded here so Phase 3+ doesn't require a schema migration — present but `.optional()`
// so Phase 2's CLI invocations work with body alone.

import { z } from 'zod';
import { hasGhostingTokens } from './ghosting.js';

const Body = z.string().min(1, 'body is required').refine(
	(s) => !hasGhostingTokens(s),
	{ message: 'Ghosting rule: payload body may not contain "thanks", "finished", or "summary".' }
);

const Anchor = z.object({
	file: z.string().optional(),
	symbol: z.string().optional(),
	line: z.number().int().nonnegative().optional(),
	ticket_id: z.string().optional(),  // Phase 3 (Plan 03-02): TRAV-04 ticket-anchor support
}).optional();

// Phase 5 Plan 05-06 PORT-05: cite-eligibility flag flips on the four candidate-kinds via
// the promotion gate (Canvas Accept on Inferred citation OR ≥N corroborations). Stays
// optional because Phase 2/3/4-seeded Explicit nodes never set it (cite_eligible is only
// meaningful for Inferred nodes). Detail field is the bookkeeping bag — the corroboration
// counter persists corroborations[] there. Attempt payload deliberately does NOT carry
// either field — Attempts are set by Canvas/Phase-4, not the promotion gate.
const CiteFlag = z.boolean().optional();
const PromotionDetail = z.object({
	corroborations: z.array(z.string()).optional(),
}).passthrough().optional();

// Phase 7 Plan 07-01 DRIFT-01: pattern-level drift detection. Each ContractNode may declare
// zero or more typed patterns describing the constraints it enforces against tracked files.
// The discriminated-union enforces exhaustiveness — adding a fourth variant (e.g. 'ast_match')
// fails type-check at every consumer until the new branch is handled.
//
// Variants:
//   - regex: source-text regex with required:true|false. Optional `scope` is a glob filter
//     over file paths; absent means "the contract's anchor file".
//   - jsonpath: structural assertion on a JSON file (op: 'exists'|'eq'|'in', value optional).
//   - forbidden_import: ES/CJS module import that violates the contract (e.g. 'string-similarity').
//
// Plans 07-02 (detector) and 07-03 (lock detector) consume DriftPattern; this declaration is
// the only schema surface they share. Plan 07-04 (ripple) uses it transitively via
// ContractPayload.patterns. Pitfall 8 from 07-RESEARCH.md: future fields belong in detail
// passthrough, NOT new top-level fields.
export const DriftPattern = z.discriminatedUnion('kind', [
	z.object({
		kind: z.literal('regex'),
		pattern: z.string(),
		required: z.boolean(),
		scope: z.string().optional(),
	}),
	z.object({
		kind: z.literal('jsonpath'),
		path: z.string(),
		op: z.enum(['exists', 'eq', 'in']),
		value: z.unknown().optional(),
	}),
	z.object({
		kind: z.literal('forbidden_import'),
		module: z.string(),
	}),
]);
export type DriftPatternT = z.infer<typeof DriftPattern>;

export const ConstraintPayload   = z.object({ kind: z.literal('ConstraintNode'), body: Body, anchor: Anchor, cite_eligible: CiteFlag, detail: PromotionDetail });
export const DecisionPayload     = z.object({ kind: z.literal('DecisionNode'),   body: Body, anchor: Anchor, derived_under_priority: z.string().optional(), cite_eligible: CiteFlag, detail: PromotionDetail });
// Phase 7 Plan 07-01: ContractPayload gains TWO additive optional fields:
//   - patterns?: DriftPattern[] — typed drift-detection patterns (DRIFT-01).
//   - enforcing_sections?: string[] — heading names (exact-equality match against ATX H1-H6
//     headings parsed from body) that lock when modified (DRIFT-03). Cosmetic edits to
//     non-enforcing sections pass silently; edits to enforcing sections fire the lock detector.
// All Phase-2..6 ContractNodes parse unchanged (both fields .optional()).
export const ContractPayload     = z.object({ kind: z.literal('ContractNode'),   body: Body, anchor: Anchor, contract_path: z.string().optional(), patterns: z.array(DriftPattern).optional(), enforcing_sections: z.array(z.string()).optional(), cite_eligible: CiteFlag, detail: PromotionDetail });
export const OpenQuestionPayload = z.object({ kind: z.literal('OpenQuestion'),   body: Body, anchor: Anchor, cite_eligible: CiteFlag, detail: PromotionDetail });

// CANV-04/05/09: AttemptPayload extension. The 'tier' enum literal is duplicated here from
// kernel/src/canvas/types.ts CanvasTierSchema — graph/* cannot import from canvas/* (layering).
// Cross-checked by kernel/src/test/canvas/attempt-payload.spec.ts.
const AttemptTierEnum = z.enum(['silent', 'inline', 'modal']);

export const AttemptPayload = z.object({
	kind: z.literal('Attempt'),
	body: Body,
	anchor: Anchor,
	attempt_kind: z.string().optional(),                      // 'accepted' | 'rejected' | 'kernel_degraded' | 'shutdown_save_bypass' (Plan 04-04) | 'contract_override' (Plan 07-06 — Phase 7 DRIFT-06)
	accept_latency_ms: z.number().nonnegative().optional(),   // CANV-09 telemetry
	tier: AttemptTierEnum.optional(),                         // CANV-04/05 record-keeping
});

export const NodePayloadSchema = z.discriminatedUnion('kind', [
	ConstraintPayload,
	DecisionPayload,
	ContractPayload,
	OpenQuestionPayload,
	AttemptPayload,
]);

export type NodePayload = z.infer<typeof NodePayloadSchema>;
export type NodeKindLiteral = NodePayload['kind'];

// Provenance is a separate (sibling-table) concern but its DAO input shape lives here for
// ergonomic imports. Phase 2 only writes source='cli' (the CLI hand-seeds; harvester is
// Phase 5). Source/actor are required because every node must be auditable.
export const ProvenanceInputSchema = z.object({
	source: z.string().min(1),     // 'cli' | 'harvester:claude_jsonl' | 'mcp:slack' | ...
	actor: z.string().min(1),
	detail: z.record(z.string(), z.unknown()).optional(),
});
export type ProvenanceInput = z.infer<typeof ProvenanceInputSchema>;
