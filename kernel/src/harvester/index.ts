/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/index.ts — Phase 5 Plan 05-03 + Plan 05-05 orchestrator.
//
// submitRawObservation is the single entry point invoked by both the chokidar JSONL
// watcher (in-process) and the harvester.submitObservation RPC handler (cross-process via
// the bridge). Steps:
//   1. Per-source enrichment dispatch — git_commit triggers enrichGitCommitObservation;
//      other sources pass through.
//   2. PORT-01 + Pitfall-8 6-gate filter (Plan 05-05 — credential-scrub + 5 predicates).
//      On reject: appendRejection + return early (PORT-02 silent rejection — no
//      promoter, no liveness, no dao.seed).
//   3. Provisional promoter — Plan 05-06 replaces. Today: optional callback.
//   4. Provisional liveness — Plan 05-07 replaces. Today: counter callback.

import type { GraphDAO } from '../graph/dao.js';
import type { RawObservation, ObservationSource, GitCommitObservation } from './observations.js';
import { runFilter, type FilterContext } from './filter/index.js';
import { appendRejection } from './filter/rejected-log.js';
import { resolveRejectedLogPath } from './paths.js';

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
 * daemon mode pass enrichGitCommitObservation); filter dependencies (dao + workspaceFolders
 * + onCorroborationCandidate) drive the Portability Filter cascade. promoter / liveness
 * are optional placeholders that subsequent plans replace.
 */
export interface HarvesterDeps {
	enrichGit: (input: GitEnrichmentInput) => Promise<GitEnrichmentResult>;
	/**
	 * Optional graph DAO for the net-new predicate's exact-tuple dedup. When omitted
	 * (e.g. very early integration tests pre-Plan 05-03), the filter still runs the
	 * other 5 predicates; net-new accepts unconditionally.
	 */
	dao?: GraphDAO;
	/** Workspace folders for the project-relevant predicate. Empty array = no scope. */
	workspaceFolders?: readonly string[];
	/** Override clock for deterministic tests. Default Date.now. */
	now?: () => number;
	/**
	 * Plan 05-06 wires this — fires when net-new rejection finds a matching Inferred
	 * node. Plan 05-05 leaves it undefined; the filter still rejects but the
	 * corroboration counter is a no-op.
	 */
	onCorroborationCandidate?: (existingNodeId: string, observationSource: ObservationSource) => Promise<void>;
	/** Override rejected-log path for tests. Defaults to resolveRejectedLogPath(). */
	rejectedLogPath?: string;
	/**
	 * Provisional filter callback. When provided, INVOKED INSTEAD OF the runFilter
	 * pipeline above. This back-door lets old tests pass a synthetic filter; new code
	 * should leave this undefined and the orchestrator runs the real cascade.
	 */
	filter?: (obs: RawObservation) => FilterDecision;
	/** Plan 05-06 wires this — promoter LLM. Plan 05-05 leaves it as a no-op stub. */
	promoter?: (obs: RawObservation) => Promise<void>;
	/** Plan 05-07 wires this — liveness recorder. Plan 05-05 leaves it as a no-op stub. */
	liveness?: LivenessRecorder;
}

/**
 * Submit a raw observation through the harvester pipeline. Always returns a structured
 * result — even for rejections — so the JSON-RPC handler never needs try/catch.
 *
 * On filter reject: appendRejection writes a JSONL line to the rejected-log; promoter
 * + liveness are skipped (PORT-02 silent rejection). The accepted-side path proceeds
 * through promoter (Plan 05-06) + liveness (Plan 05-07).
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

	const decision = await dispatchFilter(enriched, deps);
	if (decision.kind === 'reject') {
		const path = deps.rejectedLogPath ?? resolveRejectedLogPath();
		const reason: string = decision.reason ?? decision.predicate;
		appendRejection({
			observation_id: input.id,
			predicate: decision.predicate,
			reason,
			source: input.source,
			ts: new Date().toISOString(),
			body_preview: input.body.slice(0, 200),
			file_path: getObservationFilePath(input),
		}, path);
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

/**
 * Decide between the legacy explicit-filter callback (back-compat for existing tests
 * that pre-date Plan 05-05) and the production runFilter cascade. When deps.filter is
 * supplied, that callback is the source of truth and the cascade is skipped — this is
 * what kept Plan 05-03's orchestrator/index.spec.ts green when it wires its own filter
 * stub. Otherwise: build a FilterContext from deps and run the real cascade.
 */
async function dispatchFilter(
	obs: RawObservation,
	deps: HarvesterDeps,
): Promise<{ kind: 'accept' } | { kind: 'reject'; predicate: string; reason?: string }> {
	if (deps.filter) {
		return deps.filter(obs);
	}
	if (!deps.dao) {
		// No DAO and no explicit filter -> implicit accept (very early tests / stdio
		// mode where the harvester pipeline isn't wired). Plan 05-05 production path
		// always supplies dao via daemon bootstrap.
		return { kind: 'accept' };
	}
	const ctx: FilterContext = {
		dao: deps.dao,
		workspaceFolders: deps.workspaceFolders ?? [],
		now: deps.now ?? Date.now,
		onCorroborationCandidate: deps.onCorroborationCandidate,
	};
	return runFilter(obs, ctx);
}

function getObservationFilePath(obs: RawObservation): string | undefined {
	switch (obs.source) {
		case 'claude_jsonl':
		case 'editor_save':
			return obs.file_path;
		case 'terminal_shell':
			return obs.cwd ?? undefined;
		case 'git_commit':
			return obs.repo_path;
	}
}

export type { RawObservation, ObservationSource } from './observations.js';
