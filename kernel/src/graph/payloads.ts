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
}).optional();

export const ConstraintPayload   = z.object({ kind: z.literal('ConstraintNode'), body: Body, anchor: Anchor });
export const DecisionPayload     = z.object({ kind: z.literal('DecisionNode'),   body: Body, anchor: Anchor, derived_under_priority: z.string().optional() });
export const ContractPayload     = z.object({ kind: z.literal('ContractNode'),   body: Body, anchor: Anchor, contract_path: z.string().optional() });
export const OpenQuestionPayload = z.object({ kind: z.literal('OpenQuestion'),   body: Body, anchor: Anchor });
export const AttemptPayload      = z.object({ kind: z.literal('Attempt'),        body: Body, anchor: Anchor, attempt_kind: z.string().optional() });

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
