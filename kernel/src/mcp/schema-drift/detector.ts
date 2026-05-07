/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/schema-drift/detector.ts — Phase 6 (Plan 06-03 STUB; Plan 06-04 fills in).
//
// Plan 06-03 ships the call-site wiring and a no-op stub return shape so the pool can be
// fully tested end-to-end against the mock fixtures. Plan 06-04 replaces the body with a
// real SHA-256 canonical-hash detector that snapshots the upstream tools/list output and
// compares against the previous snapshot on every reconnect.
//
// When `changed: true`, the pool transitions the provider's state to 'paused_drift' and
// skips tool registration; Plan 06-04's bridge wiring raises the SchemaDriftBanner Canvas
// alert via the harvester liveness surface.

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { McpProviderName } from '../clients/types.js';

export interface DriftDetectionResult {
	changed: boolean;
	changes: Array<{ tool: string; was: string; now: string }>;
}

/**
 * Stub: always returns no-drift. Plan 06-04 replaces with real implementation.
 */
export async function snapshotAndDetectDrift(deps: { provider: McpProviderName; client: Client }): Promise<DriftDetectionResult> {
	void deps;
	return { changed: false, changes: [] };
}
