/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/mcp/clients/adapters/index.ts — Phase 6 (Plan 06-04) provider adapter dispatcher.
//
// Single switch by McpProviderName so the daemon's boot path can construct any of the 4
// configs without import gymnastics. Per-provider adapters return shape-divergent results:
//   - github / jira: Promise<McpProviderConfig | null>
//   - slack:         Promise<{config, refreshToken: string | null} | null>
//   - linear:        Promise<{config, refreshToken: string} | null>
//
// The dispatcher returns the union; callers downcast based on provider when wiring the
// TokenRefreshScheduler.

import { buildGitHubProviderConfig, type BuildGitHubProviderConfigArgs } from './github.js';
import { buildSlackProviderConfig, type BuildSlackProviderConfigArgs, type BuildSlackProviderConfigResult } from './slack.js';
import { buildLinearProviderConfig, type BuildLinearProviderConfigArgs, type BuildLinearProviderConfigResult } from './linear.js';
import { buildJiraProviderConfig, type BuildJiraProviderConfigArgs } from './jira.js';
import type { McpProviderConfig, McpProviderName } from '../types.js';

export type BuildProviderConfigDeps =
	| ({ provider: 'github' } & BuildGitHubProviderConfigArgs)
	| ({ provider: 'slack' } & BuildSlackProviderConfigArgs)
	| ({ provider: 'linear' } & BuildLinearProviderConfigArgs)
	| ({ provider: 'jira' } & BuildJiraProviderConfigArgs);

export type BuildProviderConfigResult =
	| { provider: 'github'; config: McpProviderConfig | null }
	| { provider: 'slack'; result: BuildSlackProviderConfigResult | null }
	| { provider: 'linear'; result: BuildLinearProviderConfigResult | null }
	| { provider: 'jira'; config: McpProviderConfig | null };

/**
 * Provider-typed dispatcher. Returns a discriminated union so callers stay type-safe across
 * the github/jira "config-or-null" shape and the slack/linear "config + refreshToken" shape.
 */
export async function buildProviderConfig(deps: BuildProviderConfigDeps): Promise<BuildProviderConfigResult> {
	switch (deps.provider) {
		case 'github': {
			const config = await buildGitHubProviderConfig(deps);
			return { provider: 'github', config };
		}
		case 'slack': {
			const result = await buildSlackProviderConfig(deps);
			return { provider: 'slack', result };
		}
		case 'linear': {
			const result = await buildLinearProviderConfig(deps);
			return { provider: 'linear', result };
		}
		case 'jira': {
			const config = await buildJiraProviderConfig(deps);
			return { provider: 'jira', config };
		}
	}
}

// Re-exports so callers needing a specific builder (or test helpers selecting per-provider
// shapes) can import from one entry point.
export { buildGitHubProviderConfig } from './github.js';
export { buildSlackProviderConfig } from './slack.js';
export { buildLinearProviderConfig } from './linear.js';
export { buildJiraProviderConfig } from './jira.js';
export type { McpProviderName };
