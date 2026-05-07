/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/schema-drift/paths.ts — Phase 6 (Plan 06-04) snapshot path resolver.
//
// Pitfall 12 defense: snapshots live under ~/.config/goatide/mcp/schema-snapshots/<provider>.json
// (POSIX) or %APPDATA%/goatide/mcp/schema-snapshots/<provider>.json (Windows). Nesting under
// goatide/mcp/ (NOT goatide/mcp-schema-snapshots/) keeps the existing Phase-5
// rejected_observations.jsonl + future MCP cleanup tools cleanly separated by subdirectory.
//
// XDG_CONFIG_HOME is honoured on POSIX (per the XDG Base Directory spec); Windows falls back
// to %APPDATA% (Roaming).

import { homedir } from 'node:os';
import { join } from 'node:path';

import type { McpProviderName } from '../clients/types.js';

/**
 * Compute the OS-appropriate base directory for MCP schema snapshots.
 *  - Windows: %APPDATA%/goatide/mcp/schema-snapshots
 *  - POSIX:   $XDG_CONFIG_HOME/goatide/mcp/schema-snapshots OR ~/.config/goatide/mcp/schema-snapshots
 */
export function resolveSchemaSnapshotDir(): string {
	if (process.platform === 'win32') {
		const appdata = process.env.APPDATA ?? join(homedir(), 'AppData', 'Roaming');
		return join(appdata, 'goatide', 'mcp', 'schema-snapshots');
	}
	const xdgConfig = process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config');
	return join(xdgConfig, 'goatide', 'mcp', 'schema-snapshots');
}

/**
 * Compute the absolute path for a single provider's snapshot file.
 */
export function resolveSchemaSnapshotPath(provider: McpProviderName): string {
	return join(resolveSchemaSnapshotDir(), `${provider}.json`);
}
