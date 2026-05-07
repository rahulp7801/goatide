/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/promoter/tool-schema.ts — Phase 5 Plan 05-06 PORT-04.
//
// Promoter tool definition for Anthropic's Messages API. The input_schema is derived from
// kernel/src/graph/payloads.ts NodePayloadSchema via zod-to-json-schema 3.23, so the typed-
// node taxonomy is the single source of truth for what the Promoter LLM is allowed to emit.
//
// Pinned via tool-schema.spec.ts snapshot — any future change to NodePayloadSchema (Phase
// 6+ adds a new node kind, a payload field, or relaxes a constraint) breaks the snapshot
// loudly. The developer either runs `vitest -u` to bless the new schema or corrects the
// divergence.

import { zodToJsonSchema } from 'zod-to-json-schema';
import { NodePayloadSchema } from '../../graph/payloads.js';

/**
 * Anthropic Tool definition the Promoter forces via tool_choice. The model MUST emit a
 * tool_use block whose `input` matches NodePayloadSchema; on parse-success the result
 * routes to dao.seed with confidence='Inferred'.
 */
export const promoterToolDefinition = {
	name: 'classify_observation',
	description:
		'Classify a development-context observation into a typed graph node. The input must conform to the typed-node taxonomy: ConstraintNode (rule/invariant), DecisionNode (chosen path with tradeoffs), ContractNode (named promise/API contract), OpenQuestion (unresolved investigation), or Attempt (record of a tried change). Decline by emitting plain text instead of a tool_use when the observation does not match any kind.',
	input_schema: zodToJsonSchema(NodePayloadSchema, { target: 'jsonSchema7' }),
};
