/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/test/integration/mcp/schema-drift-banner.test.ts
//
// Phase 6 Wave-0 mocha refusal stub for MCP-07 (bridge half). Plan 06-06 flips these from
// skip -> real assertions when the SchemaDriftBanner is added to the bridge: a status-bar
// item that polls kernel.mcp.getSchemaDriftReport() every 30s and renders errorBackground
// when any provider is paused_drift. Click opens a quickPick offering Accept-new-schema /
// Pause-longer / View-diff actions.

import { describe, it } from 'mocha';

describe('MCP-07: schema-drift banner polls + renders + offers user actions', () => {
	it.skip('MCP-07: banner polls mcp.getSchemaDriftReport every 30s', async () => {
		throw new Error('Plan 06-06 has not yet implemented SchemaDriftBanner.poll (setInterval 30_000 ms; injected clock for tests)');
	});

	it.skip('MCP-07: renders errorBackground when any provider is paused_drift', async () => {
		throw new Error('Plan 06-06 has not yet implemented SchemaDriftBanner errorBackground transition on paused_drift state');
	});

	it.skip('MCP-07: click → quickPick offers Accept-new-schema / Pause-longer / View-diff actions', async () => {
		throw new Error('Plan 06-06 has not yet implemented SchemaDriftBanner quickPick action menu (Accept-new-schema | Pause-longer | View-diff)');
	});
});
