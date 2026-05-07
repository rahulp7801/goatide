/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/schema-drift/detector.ts — Phase 6 (Plan 06-04) MCP-07 schema-drift detector.
//
// Replaces Plan 06-03's no-op stub with the real SHA-256 canonical-hash detector. The pool's
// call site is unchanged: state='paused_drift' on changed=true, register on changed=false.
//
// Algorithm:
//  1. Walk client.listTools() with cursor pagination (Pitfall 7).
//  2. Compute canonicalHash for each tool's inputSchema + outputSchema.
//  3. Read the persisted snapshot.
//  4. Pitfall 5: if no previous snapshot exists, this is the first-ever connect. Write the
//     baseline + return changed=false (no false-flag on cold start).
//  5. Otherwise: compare per-tool hashes; emit a {tool, was, now} entry for any mismatch
//     (including new tools not present in the previous snapshot).
//  6. DOES NOT auto-overwrite the snapshot on drift. Plan 06-06's bridge surface raises a
//     SchemaDriftBanner Canvas alert; the operator's "Accept new schema" action calls
//     acceptProviderSchemaDrift which writes the new baseline.

import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { McpProviderName } from '../clients/types.js';
import { canonicalHash, readSnapshot, writeSnapshot, type ProviderSnapshot, type ToolSchemaSnapshot } from './snapshot.js';

export interface DriftDetectionResult {
	changed: boolean;
	changes: Array<{ tool: string; was: string; now: string }>;
}

/**
 * Walk client.listTools (Pitfall 7 cursor pagination), compute canonical hashes, compare
 * against the persisted snapshot. First-ever connect: writes baseline + returns changed=false
 * (Pitfall 5). Subsequent connect with mismatch: returns changed=true with per-tool diff but
 * does NOT auto-overwrite the snapshot.
 */
export async function snapshotAndDetectDrift(deps: { provider: McpProviderName; client: Client }): Promise<DriftDetectionResult> {
	// Pitfall 7: walk listTools cursor until exhausted.
	const allTools: Array<{ name: string; inputSchema: unknown; outputSchema?: unknown }> = [];
	let cursor: string | undefined;
	while (true) {
		const r = await deps.client.listTools(cursor ? { cursor } : undefined);
		for (const t of r.tools) {
			allTools.push({ name: t.name, inputSchema: t.inputSchema, outputSchema: (t as { outputSchema?: unknown }).outputSchema });
		}
		if (!r.nextCursor) {
			break;
		}
		cursor = r.nextCursor;
	}

	const newTools: ToolSchemaSnapshot[] = allTools.map(t => ({
		name: t.name,
		input_schema_hash: canonicalHash(t.inputSchema),
		output_schema_hash: canonicalHash(t.outputSchema ?? null),
		raw_schema: { input: t.inputSchema, output: t.outputSchema },
	}));
	const newSnapshot: ProviderSnapshot = {
		provider: deps.provider,
		recorded_at: new Date().toISOString(),
		tools: newTools,
	};

	const previous = readSnapshot(deps.provider);
	if (!previous) {
		// Pitfall 5: first-ever connect — write baseline but DO NOT flag drift.
		writeSnapshot(newSnapshot);
		return { changed: false, changes: [] };
	}

	const changes: Array<{ tool: string; was: string; now: string }> = [];
	for (const newTool of newTools) {
		const old = previous.tools.find(t => t.name === newTool.name);
		if (!old) {
			changes.push({ tool: newTool.name, was: '<new>', now: newTool.input_schema_hash });
			continue;
		}
		if (old.input_schema_hash !== newTool.input_schema_hash || old.output_schema_hash !== newTool.output_schema_hash) {
			changes.push({ tool: newTool.name, was: old.input_schema_hash, now: newTool.input_schema_hash });
		}
	}

	// DO NOT auto-overwrite — operator accept-flow (Plan 06-06) calls acceptProviderSchemaDrift.
	return { changed: changes.length > 0, changes };
}

/**
 * Operator accept hook: persists `snapshot` as the new baseline. Called by the bridge's
 * SchemaDriftBanner "Accept new schema" action (Plan 06-06).
 */
export function acceptProviderSchemaDrift(snapshot: ProviderSnapshot): void {
	writeSnapshot(snapshot);
}
