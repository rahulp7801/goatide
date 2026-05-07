/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/mcp/server/tools/graph-propose-node.spec.ts — Phase 6 Wave-0 refusal stub for MCP-09 + MCP-05.
// Plan 06-02 (expose-side server) flips these.

import { describe, it } from 'vitest';

describe('MCP-09 + MCP-05: graph.proposeNode tool wraps submitRawObservation', () => {
	it.skip('MCP-09 + MCP-05: graph.proposeNode wraps submitRawObservation with source=mcp_external_signal + provenance.actor=external_mcp_client', () => {
		throw new Error('Plan 06-02 has not yet implemented graph.proposeNode (submitRawObservation wrapper with source=mcp_external_signal + actor=external_mcp_client)');
	});

	it.skip('MCP-05: reject path: filter cascade catches credential-leak in proposed body', () => {
		throw new Error('Plan 06-02 has not yet implemented credential_scrub cascade integration on graph.proposeNode reject path');
	});
});
