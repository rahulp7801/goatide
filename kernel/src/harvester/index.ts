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
import { promote, type PromoterContext, type PromoterResult } from './promoter/index.js';
import { incrementCorroborationAndMaybePromote } from './promotion-gate/index.js';
import type { LivenessState } from './liveness.js';
import type { HarvestMetricsDao } from './metrics.js';

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
 * Plan 05-07 — TELE-06 liveness watchdog handle. The full LivenessState surface (vs the
 * Plan-05-03 LivenessRecorder back-compat shape above) lets the orchestrator pass an
 * explicit `now` into recordObservation for deterministic tests; the harvester.getLiveness
 * RPC handler calls computeLiveness on every request so the bridge always sees a fresh
 * report (no cached snapshots, no cron-style timers in the kernel).
 */
export interface LivenessTracker {
	recordObservation(source: ObservationSource, now?: number): void;
	computeLiveness(opts: {
		now: number;
		thresholds?: Partial<Record<ObservationSource, number>>;
	}): import('./liveness.js').LivenessReport[];
}

/**
 * Plan 05-06 — promoter result hook. Optional callback invoked AFTER the Promoter has
 * classified an observation. Lets metrics-style consumers see the discriminated union
 * without re-parsing. Plan 05-07 wires harvest_metrics_daily.incrementPromoted /
 * incrementPromoterFailed via this hook.
 */
export type PromoterResultHook = (result: PromoterResult, observation: RawObservation) => void;

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
	/**
	 * Legacy provisional promoter callback (Plan 05-03 back-compat). When provided AND
	 * promoterCtx is undefined, this runs in place of the real Promoter — the
	 * orchestrator does not seed any Inferred node. Plan 05-05 filter-integration tests
	 * use this so they don't need the full Promoter stack. New code should leave this
	 * undefined and supply promoterCtx instead.
	 */
	promoter?: (obs: RawObservation) => Promise<void>;
	/**
	 * Phase 5 Plan 05-06 — full Promoter context. When supplied, the orchestrator routes
	 * filter-survivor observations through promote(), and on PromoterResult.kind ===
	 * 'classified' seeds a confidence='Inferred' node + corroborates same-anchor siblings.
	 */
	promoterCtx?: PromoterContext;
	/** Plan 05-07 wires this — observability hook for promoter results. */
	onPromoterResult?: PromoterResultHook;
	/**
	 * Legacy Plan 05-03 liveness recorder back-compat. New code uses livenessState (below);
	 * the orchestrator falls back to this callback when livenessState is undefined.
	 */
	liveness?: LivenessRecorder;
	/**
	 * Plan 05-07 — TELE-06 LivenessState. recordObservation is invoked at submitRawObservation
	 * entry (BEFORE the filter cascade) so even rejected observations advance the watchdog.
	 */
	livenessState?: LivenessTracker;
	/**
	 * Plan 05-07 — PORT-06 daily metrics DAO. incrementSubmitted on entry, incrementRejected
	 * on filter reject, incrementPromoted on Promoter classified-success.
	 */
	metrics?: HarvestMetricsDao;
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
	const nowMs = (deps.now ?? Date.now)();

	// Plan 05-07 TELE-06 + PORT-06: liveness + submitted-counter run BEFORE the filter
	// cascade. A source whose observations are all being rejected by the filter is still
	// alive (the watchdog tracks watcher health, not filter survival), and the daily
	// submitted counter feeds the per-source accept-rate the developer reads in `goatide-cli
	// harvest metrics`.
	if (deps.livenessState) {
		deps.livenessState.recordObservation(input.source, nowMs);
	} else if (deps.liveness) {
		deps.liveness.record(input.source);
	}
	if (deps.metrics) {
		deps.metrics.incrementSubmitted(input.source, nowMs);
	}

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
			ts: new Date(nowMs).toISOString(),
			body_preview: input.body.slice(0, 200),
			file_path: getObservationFilePath(input),
		}, path);
		// Plan 05-07 PORT-06: roll up the reject into the daily counter. Predicate is not
		// stored at the daily level (rejected_observations.jsonl carries that); the parameter
		// is for self-documenting call-sites.
		if (deps.metrics) {
			deps.metrics.incrementRejected(input.source, decision.predicate, nowMs);
		}
		return { id: input.id, accepted: false, reject_reason: decision.predicate };
	}

	// Phase 5 Plan 05-06 — run the real Promoter when ctx supplied; otherwise fall back to
	// the legacy callback (Plan 05-03 back-compat for filter-integration tests).
	if (deps.promoterCtx) {
		const result = await promote(enriched, deps.promoterCtx);
		if (deps.onPromoterResult) {
			deps.onPromoterResult(result, enriched);
		}
		if (result.kind === 'classified' && deps.dao) {
			// PORT-04: write Inferred node. Mandate B: confidence='Inferred' is what
			// distinguishes a Promoter candidate from an Explicit (CLI / Canvas) seed.
			const provenanceSource = `harvester:${enriched.source}`;
			const { id: newNodeId } = deps.dao.seed({
				payload: result.payload,
				confidence: 'Inferred',
				provenance: {
					source: provenanceSource,
					actor: 'promoter',
					detail: {
						observation_id: input.id,
						model: result.model,
						input_tokens: result.usage.input_tokens,
						output_tokens: result.usage.output_tokens,
					},
				},
			});

			// Plan 05-07 PORT-06: roll up the promotion into the daily counter.
			if (deps.metrics) {
				deps.metrics.incrementPromoted(enriched.source, nowMs);
			}

			// PORT-05 (b) post-seed corroboration sweep: if any existing Inferred sibling
			// shares the new node's anchor.file, increment its corroboration counter.
			// Defense-in-depth — Plan 05-05's net_new predicate already rejects exact-tuple
			// duplicates, but a fresh first-of-cluster Inferred write should still
			// corroborate against same-anchor existing rows that have a DIFFERENT body.
			// (In v1 we keep it minimal: any same-file existing Inferred counts as a
			//  corroboration. Phase 7 tightens to symbol-level anchors.)
			await maybeCorroborateSiblings(deps.dao, newNodeId, result.payload, provenanceSource);
		}
	} else if (deps.promoter) {
		await deps.promoter(enriched);
	}

	return { id: input.id, accepted: true };
}

/**
 * Iterate same-anchor.file Inferred siblings (excluding the just-seeded id) and increment
 * their corroboration counter under the new node's provenance source. The promotion gate
 * may fire and supersede those siblings to cite_eligible=true if the threshold is reached.
 */
async function maybeCorroborateSiblings(
	dao: GraphDAO,
	newNodeId: string,
	newPayload: { anchor?: { file?: string } },
	provenanceSource: string,
): Promise<void> {
	const file = newPayload.anchor?.file;
	if (!file) {
		return;
	}
	const asOf = new Date().toISOString();
	const candidates = dao.queryByAnchor({ jsonPath: '$.anchor.file', value: file }, asOf);
	for (const candidate of candidates) {
		if (candidate.id === newNodeId || candidate.confidence !== 'Inferred') {
			continue;
		}
		try {
			await incrementCorroborationAndMaybePromote({
				dao,
				nodeId: candidate.id,
				observationProvenanceSource: provenanceSource,
			});
		} catch {
			// Best-effort: do not break the orchestrator on promotion-gate hiccups.
		}
	}
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
