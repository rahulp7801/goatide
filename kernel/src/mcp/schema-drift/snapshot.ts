/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/schema-drift/snapshot.ts — Phase 6 (Plan 06-04) MCP-07 schema-drift snapshot.
//
// canonicalHash + readSnapshot + writeSnapshot. Mirrors 06-RESEARCH.md ## Pattern: Schema-Drift
// Snapshot. The canonical-hash function recursively sorts object keys before JSON-stringifying
// so {a:1, b:2} and {b:2, a:1} produce identical SHA-256 hex output — schemas don't drift just
// because the upstream serializer changed key ordering.

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

import type { McpProviderName } from '../clients/types.js';
import { resolveSchemaSnapshotPath } from './paths.js';

/**
 * Per-tool snapshot record. The pool's snapshotAndDetectDrift writes one entry per
 * client.listTools() result.
 */
export interface ToolSchemaSnapshot {
	name: string;
	input_schema_hash: string;
	output_schema_hash: string;
	raw_schema: { input: unknown; output: unknown };
}

/**
 * Per-provider top-level snapshot. Persisted as a single JSON file per provider; identifies
 * the recording timestamp + the full per-tool entries. ProviderSnapshot.tools order follows
 * the order returned by client.listTools (after cursor walk).
 */
export interface ProviderSnapshot {
	provider: McpProviderName;
	recorded_at: string;
	tools: ToolSchemaSnapshot[];
}

/**
 * Recursively sort object keys + JSON-stringify + SHA-256 hex. Stable across the upstream
 * serializer's key-order choices. Handles primitives, arrays, and nested objects; null values
 * pass through unchanged.
 */
export function canonicalHash(value: unknown): string {
	const canonical = JSON.stringify(canonicalize(value));
	return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Read a persisted snapshot from the OS-appropriate path. Returns null when the file is
 * missing — caller (snapshotAndDetectDrift) treats null as the "first-ever connect" signal
 * and writes a baseline without flagging drift (Pitfall 5).
 */
export function readSnapshot(provider: McpProviderName): ProviderSnapshot | null {
	const path = resolveSchemaSnapshotPath(provider);
	if (!existsSync(path)) {
		return null;
	}
	try {
		const raw = readFileSync(path, 'utf8');
		const parsed = JSON.parse(raw) as ProviderSnapshot;
		return parsed;
	} catch {
		// Corrupt JSON → treat as missing so the next connect rewrites a clean baseline.
		return null;
	}
}

/**
 * Persist a snapshot to disk. Creates the parent directory recursively (Pitfall 12 path is
 * deeply nested under goatide/mcp/schema-snapshots/). Caller is responsible for choosing
 * when to write — snapshotAndDetectDrift writes only on first connect or on operator accept.
 */
export function writeSnapshot(snapshot: ProviderSnapshot): void {
	const path = resolveSchemaSnapshotPath(snapshot.provider);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, JSON.stringify(snapshot, null, 2), 'utf8');
}

// --- Internal: recursive key sorting -----------------------------------------------------

function canonicalize(value: unknown): unknown {
	if (value === null || typeof value !== 'object') {
		return value;
	}
	if (Array.isArray(value)) {
		return value.map(canonicalize);
	}
	const sortedKeys = Object.keys(value as Record<string, unknown>).sort();
	const result: Record<string, unknown> = {};
	for (const k of sortedKeys) {
		result[k] = canonicalize((value as Record<string, unknown>)[k]);
	}
	return result;
}
