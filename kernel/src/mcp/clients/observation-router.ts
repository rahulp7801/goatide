/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/clients/observation-router.ts — Phase 6 (Plan 06-05) MCP-05 external-signal routing.
//
// routeMcpObservation is the bridge between the consume-side multiplexer (Plan 06-03's pool)
// and the Phase-5 ingestion conveyor. Tool-call results from the 4 providers (GitHub, Slack,
// Linear, Jira) are wrapped as RawObservation with source='mcp_external_signal' and submitted
// to submitRawObservation, which runs the SAME 6-gate filter cascade (credential-scrub ->
// portable -> net-new -> project-relevant -> verifiable -> justified) that local terminal /
// editor / git observations go through.
//
// CONSTITUTIONAL SYMMETRY: external MCP writes are NOT a privileged path — a Slack thread
// containing 'sk-ant-fake' is rejected by credential-scrub identically to a local terminal
// command containing the same string. Mandate A (zero-tax) preserved: developer doesn't see
// a prompt; Mandate B (supersession-only) preserved: external signals create Inferred nodes;
// Mandate C (no fuzzy retrieval) preserved: anchor resolution stays exact-tuple; Mandate D
// (every change through Canvas) preserved: promoted Inferred nodes surface on later
// Receipt-gated saves.
//
// Pitfall 4 defense: tool-level errors (isError:true) are NOT routed. The pool's tool-call
// handler (Plan 06-03) already checks isError BEFORE invoking onObservation; routeMcpObservation
// is defense-in-depth — if a caller mistakenly passes an isError result, we short-circuit
// with predicate='tool_error' rather than corrupting the observation pipeline.

import { ulid } from 'ulid';
import { submitRawObservation, type HarvesterDeps } from '../../harvester/index.js';
import type { McpExternalSignalObservation } from '../../harvester/observations.js';
import { mapToolResultToCandidate } from '../schema-mapper.js';
import type { McpProviderName } from './types.js';

export interface RouteMcpObservationInput {
	provider: McpProviderName;
	tool_name: string;
	arguments: unknown;
	result: unknown;
	/** Pitfall 4: if true, the observation is NOT routed. Defaults to false. */
	isError?: boolean;
	/** Phase-5 harvester dependency bag — supplies dao, filter, promoter, livenessState, etc. */
	deps: HarvesterDeps;
}

export interface RouteMcpObservationResult {
	accepted: boolean;
	/** Set when accepted=false. 'tool_error' for Pitfall 4 short-circuit; otherwise the
	 *  Phase-5 filter predicate that rejected (e.g. 'credential_scrub', 'project_relevant'). */
	predicate?: string;
}

/**
 * Wrap a tool-call result as a `mcp_external_signal` RawObservation and submit it through
 * the Phase-5 6-gate cascade. Returns {accepted, predicate?} so callers (graph.proposeNode
 * tool handler) can render structuredContent.rejected_by=<predicate> on filter rejection
 * (Pitfall 11 — filter rejection is a CORRECT outcome, NOT a tool error).
 */
export async function routeMcpObservation(input: RouteMcpObservationInput): Promise<RouteMcpObservationResult> {
	if (input.isError === true) {
		// Pitfall 4: tool-level errors are NOT graph signals. The pool's handler should
		// have caught this already; defense-in-depth here.
		return { accepted: false, predicate: 'tool_error' };
	}

	const { candidate_node_kind_hint, body } = mapToolResultToCandidate(input.provider, input.tool_name, input.result);

	const observation: McpExternalSignalObservation = {
		id: ulid(),
		ts: new Date().toISOString(),
		source: 'mcp_external_signal',
		provider: input.provider,
		tool_name: input.tool_name,
		body,
		detail: { candidate_node_kind_hint },
	};

	const result = await submitRawObservation(observation, input.deps);
	if (result.accepted) {
		return { accepted: true };
	}
	return { accepted: false, predicate: result.reject_reason };
}
