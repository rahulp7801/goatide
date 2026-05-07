/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/clients/observation-router.spec.ts — Phase 6 Wave-0 refusal stub for MCP-05.
// Plan 06-05 (schema-mapper + observation routing) flips these.

import { describe, it } from 'vitest';

describe('MCP-05: routing MCP tool results into the Phase-5 raw observation pipeline', () => {
	it.skip('MCP-05: mcp_external_signal observation routes through submitRawObservation (Phase-5 6-gate cascade)', () => {
		throw new Error('Plan 06-05 has not yet implemented routeMcpResultToObservation -> submitRawObservation with source=mcp_external_signal');
	});

	it.skip('MCP-05: credential leak in Slack thread payload caught by credential-scrub gate (Pitfall 4 isError check + Phase-5 gate)', () => {
		throw new Error('Plan 06-05 has not yet implemented credential_scrub interception of MCP-routed observations (Pitfall 4: isError check before routing)');
	});

	it.skip('MCP-05: tool-level error (isError:true) NOT routed as observation', () => {
		throw new Error('Plan 06-05 has not yet implemented isError short-circuit (tool-level errors do not become observations)');
	});
});
