/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/paths.ts — Phase 5 Plan 05-05.
//
// Harvester-side filesystem path helpers. All resolutions are relative to the goatide
// config dir (~/.config/goatide on Linux/macOS, %APPDATA%/goatide on Windows) — same
// directory the daemon lockfile sits in. Cross-imports kernel/src/daemon/paths.ts for
// the platform-aware config-dir resolver (single source of truth).

import { join } from 'node:path';
import { resolveGoatideConfigDir } from '../daemon/paths.js';

/**
 * Absolute path to the rejected-observation JSONL log. PORT-03: silent rejections still
 * land here for CLI inspection. Plan 05-07 wires `goatide-cli harvest rejections` against
 * this path.
 */
export function resolveRejectedLogPath(): string {
	return join(resolveGoatideConfigDir(), 'rejected_observations.jsonl');
}

/**
 * Absolute path to the recorded-fixture directory used by Plan 05-06's recorded-LLM
 * fixture mode. Phase 5 does not write into this directory; it exists so the LLM
 * recorder can stage fixtures next to the daemon's other state.
 */
export function resolveLLMFixtureDir(): string {
	return join(resolveGoatideConfigDir(), 'fixtures');
}
