/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/harvester/promoter/keytar-resolver.ts — Phase 5 Plan 05-06 PORT-04.
//
// API-key resolution for the Promoter LLM call. Tries the OS keychain via keytar 7.9
// first (canonical: `goatide.anthropic.api_key`), then falls back to the
// ANTHROPIC_API_KEY environment variable as a v1.x escape hatch.
//
// Returns null when neither source has a key — caller handles graceful degrade
// (Promoter logs a warning + returns transport_error; observations accumulate in
// metrics_daily but no Inferred nodes get seeded).
//
// Setup paths for the developer:
//   1. `keytar-cli set goatide.anthropic.api_key <key>` (recommended; OS keychain)
//   2. `export ANTHROPIC_API_KEY=<key>` (escape hatch; v1.x only)
//   A `goatide-cli configure anthropic-key` UX is deferred to a future plan.

const KEYCHAIN_SERVICE = 'goatide.anthropic.api_key';
const KEYCHAIN_ACCOUNT = 'goatide';

/**
 * Resolve the Anthropic API key from the OS keychain or the environment fallback.
 * Returns null on missing — never throws (keytar errors are swallowed so a malfunctioning
 * keychain doesn't take the daemon down).
 */
export async function resolveAnthropicApiKey(): Promise<string | null> {
	try {
		// Lazy import — keytar's native binding is loaded only when the resolver is
		// actually invoked (recorded-fixture mode bypasses this entirely). Avoids paying
		// the load cost in unit tests that never reach the live path.
		const keytar = await import('keytar');
		const stored = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT);
		if (stored && stored.length > 0) {
			return stored;
		}
	} catch {
		// Best-effort; fall through to env var.
	}
	const envKey = process.env.ANTHROPIC_API_KEY;
	if (envKey && envKey.length > 0) {
		return envKey;
	}
	return null;
}
