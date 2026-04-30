/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/cli/kind-alias.ts — Phase 2 (Plan 02-04) single source of truth for the
// lowercase-alias → canonical-NodeKind mapping. Imported by both `graph seed` and
// `graph query`. CLAUDE.md ## Code Quality forbids duplicating this table across
// command modules.
//
// The CLI surface speaks aliases ('constraint', 'open-question'); everything below the
// CLI uses canonical PascalCase ('ConstraintNode', 'OpenQuestion'). ROADMAP.md success
// criterion #1 explicitly invokes `--kind constraint` so this layer exists to bridge.

import type { NodeKind } from '../graph/index.js';

export const KIND_ALIAS: Record<string, NodeKind> = {
	constraint: 'ConstraintNode',
	decision: 'DecisionNode',
	contract: 'ContractNode',
	'open-question': 'OpenQuestion',
	attempt: 'Attempt',
};

/**
 * Resolve an alias (case-insensitive) to its canonical NodeKind, or null if unknown.
 *
 * @param input  Lowercase alias from the --kind CLI flag.
 * @returns      Canonical NodeKind or null when the alias is not in KIND_ALIAS.
 */
export function resolveKindAlias(input: string): NodeKind | null {
	return KIND_ALIAS[input.toLowerCase()] ?? null;
}
