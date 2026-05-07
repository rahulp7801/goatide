/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/index.ts — Phase 5 Plan 05-03 orchestrator.
//
// submitRawObservation is the single entry point invoked by both the chokidar JSONL
// watcher (in-process) and the harvester.submitObservation RPC handler (cross-process via
// the bridge). Steps:
//   1. Per-source enrichment dispatch — git_commit triggers enrichGitCommitObservation;
//      other sources pass through.
//   2. Provisional filter — Plan 05-05 replaces. Today: always-accept.
//   3. Provisional promoter — Plan 05-06 replaces. Today: no-op (records nothing).
//   4. Provisional liveness — Plan 05-07 replaces. Today: counter callback.
//
// This "plumbing-first" approach mirrors the Plan 04-05 "tolerates missing receipt"
// pattern: the wire surface is alive end-to-end while the downstream pipeline lands
// incrementally in subsequent plans.

import type { RawObservation, ObservationSource, GitCommitObservation } from './observations.js';

export interface SubmitObservationResult {
	id: string;
	accepted: boolean;
	reject_reason?: string;
}

export type FilterDecision = { kind: 'accept' } | { kind: 'reject'; predicate: string };

export interface GitEnrichmentInput {
	repo_path: string;
	head_commit_at_emit: string | null;
}

export interface GitEnrichmentResult {
	diff?: string;
	message?: string;
	author?: string;
	files_changed?: number;
}

export interface LivenessRecorder {
	record(source: ObservationSource): void;
}

/**
 * Dependency bag for the harvester orchestrator. enrichGit is required (callers in
 * daemon mode pass enrichGitCommitObservation); filter/promoter/liveness are optional
 * placeholders that subsequent plans replace.
 */
export interface HarvesterDeps {
	enrichGit: (input: GitEnrichmentInput) => Promise<GitEnrichmentResult>;
	filter?: (obs: RawObservation) => FilterDecision;
	promoter?: (obs: RawObservation) => Promise<void>;
	liveness?: LivenessRecorder;
}

/**
 * Submit a raw observation through the harvester pipeline. Always returns a structured
 * result — even for rejections — so the JSON-RPC handler never needs try/catch.
 */
export async function submitRawObservation(
	input: RawObservation,
	deps: HarvesterDeps,
): Promise<SubmitObservationResult> {
	let enriched: RawObservation = input;
	if (input.source === 'git_commit') {
		const extra = await deps.enrichGit({
			repo_path: input.repo_path,
			head_commit_at_emit: input.head_commit_at_emit,
		});
		enriched = { ...input, ...extra } satisfies GitCommitObservation;
	}

	const decision: FilterDecision = deps.filter ? deps.filter(enriched) : { kind: 'accept' };
	if (decision.kind === 'reject') {
		return { id: input.id, accepted: false, reject_reason: decision.predicate };
	}

	if (deps.promoter) {
		await deps.promoter(enriched);
	}
	if (deps.liveness) {
		deps.liveness.record(enriched.source);
	}

	return { id: input.id, accepted: true };
}

export type { RawObservation, ObservationSource } from './observations.js';
