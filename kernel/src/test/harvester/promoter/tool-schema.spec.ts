/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/harvester/promoter/tool-schema.spec.ts — Phase 5 Plan 05-06 PORT-04.
//
// Snapshot pin for the JSON-schema export of NodePayloadSchema (kernel/src/graph/payloads.ts).
// If NodePayloadSchema changes (Phase 6+ adds a new node kind, or a payload field), this
// snapshot fails loudly so the developer either blesses the new schema (vitest -u) or
// corrects the divergence.

import { describe, it, expect } from 'vitest';
import { promoterToolDefinition } from '../../../harvester/promoter/tool-schema.js';

describe('PORT-04: Promoter tool-schema export', () => {
	it('zodToJsonSchema(NodePayloadSchema) is structurally equivalent to the snapshotted JSON schema', () => {
		expect({
			name: promoterToolDefinition.name,
			hasDescription: typeof promoterToolDefinition.description === 'string'
				&& promoterToolDefinition.description.length > 0,
			schema: promoterToolDefinition.input_schema,
		}).toMatchSnapshot();
	});
});
