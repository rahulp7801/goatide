/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/promoter/prompt.ts — Phase 5 Plan 05-06 PORT-04.
//
// Prompt construction for the Candidate Promoter LLM call. Builds a structured system
// prompt + user turn from a filter-survivor RawObservation. PROMPT_VERSION is pinned for
// fixture stability — any prompt edit must bump the version + invalidate fixtures (the
// fixtureLookup hashes the canonicalized observation, NOT the prompt, so prompt edits do
// not directly break fixture replay; the version is here so production code can route to
// a new fixture set if a future iteration changes the prompt enough to materially change
// model output).

import type { RawObservation } from '../observations.js';

/**
 * Bumped on any prompt edit. Recorded fixtures captured under one PROMPT_VERSION are
 * conceptually invalidated when the version increments — the developer either re-records
 * them or routes the new prompt against a fresh fixture set.
 */
export const PROMPT_VERSION = 1;

const SYSTEM_PROMPT = `You are the Candidate Promoter for GoatIDE — a development environment that captures decisions, constraints, contracts, and open questions as typed graph nodes with bitemporal provenance.

Your job: read ONE development-context observation (a Claude transcript line, an editor save event, a terminal command result, or a git commit) and decide whether it should become a typed node in the graph.

Use the classify_observation tool to emit a structured payload. The kind field MUST be one of:
- ConstraintNode: a rule or invariant that future changes must satisfy. Example: "All API endpoints must return JSON with a top-level error field on failure."
- DecisionNode: a chosen path with stated tradeoffs. Example: "Use BigDecimal for currency arithmetic; rejected float for precision drift."
- ContractNode: a named promise / API contract. Example: "UserService.requireById throws on missing id."
- OpenQuestion: an unresolved investigation. Example: "Should the JWT refresh window be 15 minutes or 60 minutes?"
- Attempt: a record of a tried change (rare on the harvester path; usually set by the Canvas).

If the observation does NOT match any kind — it is small talk, a vague opinion, or insufficient context — DECLINE by emitting plain text explaining why, NOT a tool_use. The orchestrator will drop the observation silently.

Anchor field: include the file path the claim concerns. For commits and terminal events without a single file, omit anchor.file. Never invent a path.

Body field: be concise (one paragraph max), preserve the original technical claim, and use objective language ("X must do Y" / "X was changed to Y"). Avoid opinion words ("messy", "elegant", "feels").`;

/**
 * Build the prompt strings sent to the Anthropic Messages API. Returns separate system
 * and user content so the SDK call site can route them through the typed parameter shape.
 */
export function buildPrompt(observation: RawObservation): { system: string; userContent: string } {
	const sourceLabel = describeSource(observation);
	const userContent =
		`Source: ${sourceLabel}\n` +
		`Body:\n${observation.body || '(empty)'}\n` +
		(observation.source === 'claude_jsonl' || observation.source === 'editor_save'
			? `File: ${observation.file_path}\n`
			: '') +
		(observation.source === 'terminal_shell' && observation.cwd
			? `Working directory: ${observation.cwd}\n`
			: '') +
		(observation.source === 'git_commit'
			? `Repo: ${observation.repo_path}\n`
			+ (observation.message ? `Commit message: ${observation.message}\n` : '')
			: '') +
		'\nClassify if appropriate; otherwise decline with plain text.';

	return { system: SYSTEM_PROMPT, userContent };
}

function describeSource(observation: RawObservation): string {
	switch (observation.source) {
		case 'claude_jsonl': return 'Claude assistant transcript';
		case 'editor_save': return 'Editor save event';
		case 'terminal_shell': return 'Terminal shell execution';
		case 'git_commit': return 'Git commit';
	}
}
