/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/liveness.ts — Phase 6 (Plan 06-06) MCP-06 per-provider liveness extension.
//
// Extends the Phase-5 LivenessState with 4 mcp.<provider> sources (mcp.github / mcp.slack /
// mcp.linear / mcp.jira). Reuses the existing Phase-5 LivenessState class — no parallel state
// machine; per-provider observation timestamps live in the same Map<source, ts>.
//
// Design constraint: ObservationSource (kernel/src/harvester/observations.ts) is a Zod
// discriminated-union literal type and cannot be widened without churn through the harvester
// pipeline. So the 4 mcp.<provider> sources are ADDITIVE keys on the SAME LivenessState Map but
// are NOT added to the ObservationSource union — they are tracked under their own
// MCP_LIVENESS_KEYS string literal alphabet and surfaced through computeLiveness via the
// `thresholds` override pathway. The bridge consumes them through the existing
// harvester.getLiveness RPC because the LivenessReport surface keys on `source: string`.
//
// Threshold defaults: 1h per provider. MCP providers are bursty (a developer might query
// Slack once per task) so an hour without an observation is normal — the threshold guards
// against silent failure (provider stuck in restarting/backoff loop), not low-throughput.
// Override per provider via env GOATIDE_MCP_LIVENESS_<PROVIDER>_MS.

import type { LivenessReport } from '../harvester/liveness.js';
import type { ObservationSource } from '../harvester/observations.js';
import type { McpProviderName } from './clients/types.js';

/**
 * Structural shape used by this module — same surface as the harvester's LivenessTracker
 * interface but redeclared here to keep the import chain unidirectional (mcp → harvester
 * primitives, never harvester → mcp). Both LivenessState and LivenessTracker satisfy this.
 */
interface LivenessLike {
	recordObservation(source: ObservationSource, now?: number): void;
	computeLiveness(opts: {
		now: number;
		thresholds?: Partial<Record<ObservationSource, number>>;
	}): LivenessReport[];
}

/**
 * Canonical MCP liveness source key for a provider. Exported for tests + the bridge so the
 * `mcp.<provider>` literal isn't reinvented at every call site.
 */
export function mcpLivenessSourceKey(provider: McpProviderName): string {
	return `mcp.${provider}`;
}

/**
 * Default per-provider thresholds (ms). 1h each. Override via env
 * GOATIDE_MCP_LIVENESS_<PROVIDER>_MS (e.g. GOATIDE_MCP_LIVENESS_SLACK_MS=300000).
 */
export const DEFAULT_MCP_LIVENESS_THRESHOLDS: Record<McpProviderName, number> = {
	github: parseEnvMs('GOATIDE_MCP_LIVENESS_GITHUB_MS') ?? 60 * 60 * 1000,
	slack: parseEnvMs('GOATIDE_MCP_LIVENESS_SLACK_MS') ?? 60 * 60 * 1000,
	linear: parseEnvMs('GOATIDE_MCP_LIVENESS_LINEAR_MS') ?? 60 * 60 * 1000,
	jira: parseEnvMs('GOATIDE_MCP_LIVENESS_JIRA_MS') ?? 60 * 60 * 1000,
};

/**
 * The 4 MCP provider liveness source keys, alphabetized for stable iteration. Used by the
 * RPC handler when synthesizing the bridge-facing report and by tests asserting the source
 * surface.
 */
export const MCP_LIVENESS_KEYS: readonly string[] = Object.freeze([
	'mcp.github',
	'mcp.jira',
	'mcp.linear',
	'mcp.slack',
]);

/**
 * Record an MCP-provider observation against the shared Phase-5 LivenessState. The pool's
 * onObservation callback (Plan 06-05) already routes successful tool-call results through
 * submitRawObservation as `mcp_external_signal` — this helper is the per-provider liveness
 * watch additionally so the bridge can show a paused_auth/restarting provider as stale even
 * when the harvester filter would also count the same call.
 *
 * The cast goes through `as never` because LivenessState.recordObservation is typed against
 * ObservationSource (the Zod literal union); we deliberately store a string outside that
 * union here. The Map<string, number> internal storage is structurally compatible.
 */
export function recordMcpObservation(
	state: LivenessLike,
	provider: McpProviderName,
	now: number = Date.now(),
): void {
	const key = mcpLivenessSourceKey(provider) as unknown as ObservationSource;
	state.recordObservation(key, now);
}

/**
 * Build the bridge-facing per-provider liveness report. Reads the same Map<source, ts> that
 * Phase-5 sources use; merges MCP defaults into the thresholds bag so computeLiveness emits
 * stale flags for the mcp.* keys too. The Phase-5 sources continue to be reported alongside.
 */
export function computeMcpLiveness(args: {
	state: LivenessLike;
	now: number;
	thresholds?: Record<string, number>;
}): LivenessReport[] {
	const merged: Record<string, number> = { ...args.thresholds };
	for (const provider of Object.keys(DEFAULT_MCP_LIVENESS_THRESHOLDS) as McpProviderName[]) {
		merged[mcpLivenessSourceKey(provider)] = DEFAULT_MCP_LIVENESS_THRESHOLDS[provider];
	}
	// LivenessState.computeLiveness expects `Partial<Record<ObservationSource, number>>` — the
	// extra mcp.* keys are dropped from the type signature but preserved in the runtime Map.
	// Cast through unknown to permit the wider key set without altering the harvester schema.
	const reports = args.state.computeLiveness({
		now: args.now,
		thresholds: merged as unknown as Partial<Record<ObservationSource, number>>,
	});
	return reports;
}

function parseEnvMs(name: string): number | null {
	const raw = process.env[name];
	if (raw === undefined) {
		return null;
	}
	const v = Number.parseInt(raw, 10);
	if (!Number.isFinite(v) || v <= 0) {
		return null;
	}
	return v;
}
