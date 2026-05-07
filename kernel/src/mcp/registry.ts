/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/registry.ts — Phase 6 (Plan 06-03) MCP-02 ToolRegistry.
//
// Single source-of-truth for namespaced MCP tool dispatch. Every external-provider tool
// gets stored under `<provider>__<tool>` (literal SEPARATOR = '__'). Two providers happening
// to expose `issue_read` cannot collide (they become github__issue_read and slack__issue_read).
// Accidental duplicate registration of the SAME (provider, originalName) pair throws — the
// CI gate scripts/ci/refuse-mcp-collision.sh additionally static-greps this file for the
// `<provider>__<tool>` namespacing pattern to catch any drift in the convention.

import type { McpProviderName } from './clients/types.js';

/**
 * Literal namespacing separator. Pinned at the source level; refuse-mcp-collision.sh
 * structurally scans for the `<provider>__<tool>` pattern.
 */
export const SEPARATOR = '__';

/**
 * Provider-name validation pattern. Lowercase + digits + underscore, must start with
 * a letter, max 32 chars. Defends against:
 *  - case mismatches (e.g. 'GitHub' vs 'github') that would split the registry across
 *    casings;
 *  - hyphens (e.g. 'gh-mcp') that complicate downstream regex / shell-quoting in
 *    refusal-gate scripts;
 *  - whitespace + punctuation in CLI / config user-input paths.
 */
const PROVIDER_RE = /^[a-z][a-z0-9_]{0,31}$/;

/**
 * Tool registration record. The pool's per-tool dispatch wraps `handler` in the isError
 * + onObservation post-processing (Pitfall 4 + Plan 06-05). Registry stays pure: no
 * dispatch, no wrapping, just storage.
 */
export interface ToolRegistration {
	provider: McpProviderName;
	originalName: string;
	inputSchema: unknown;
	handler: (args: unknown) => Promise<unknown>;
}

/**
 * Source-of-truth registry for namespaced MCP tools. Single-instance per pool; the pool
 * passes this object into per-provider startProvider() calls so each provider can register
 * its tools as listTools is walked.
 */
export class ToolRegistry {
	private readonly tools = new Map<string, ToolRegistration>();

	/**
	 * Register a tool under `<provider>${SEPARATOR}${originalName}`. Returns the namespaced name.
	 * Throws on collision (same provider+originalName already registered) or invalid provider.
	 */
	register(input: ToolRegistration): string {
		if (!PROVIDER_RE.test(input.provider)) {
			throw new Error(`ToolRegistry: provider name violates pattern (${PROVIDER_RE.source}): ${JSON.stringify(input.provider)}`);
		}
		const namespaced = `${input.provider}${SEPARATOR}${input.originalName}`;
		if (this.tools.has(namespaced)) {
			throw new Error(`ToolRegistry: tool name collision: ${namespaced}`);
		}
		this.tools.set(namespaced, input);
		return namespaced;
	}

	/** Lookup by fully-namespaced name. Returns undefined if not present. */
	get(namespacedName: string): ToolRegistration | undefined {
		return this.tools.get(namespacedName);
	}

	/** All registered tools as {name, provider} pairs. Stable insertion order. */
	listAll(): ReadonlyArray<{ name: string; provider: McpProviderName }> {
		return [...this.tools.entries()].map(([name, reg]) => ({ name, provider: reg.provider }));
	}

	/** All registrations for a given provider. Used by the pool when reconnecting a single provider. */
	listByProvider(provider: McpProviderName): ReadonlyArray<ToolRegistration> {
		return [...this.tools.values()].filter(r => r.provider === provider);
	}

	/** Drop every tool for the given provider (used on reconnect to avoid stale collision). */
	clearProvider(provider: McpProviderName): void {
		for (const [name, reg] of [...this.tools.entries()]) {
			if (reg.provider === provider) {
				this.tools.delete(name);
			}
		}
	}

	/** Drop everything. Used by tests. */
	clear(): void {
		this.tools.clear();
	}
}
