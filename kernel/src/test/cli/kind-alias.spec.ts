/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/cli/kind-alias.spec.ts — Phase 2 (Plan 02-04) Task 2 RED.
// Single source of truth for the lowercase-alias → canonical-NodeKind mapping
// (CLAUDE.md ## Code Quality: do not duplicate code; both seed.ts and query.ts
// import from this module).

import { describe, it, expect } from 'vitest';
import { KIND_ALIAS, resolveKindAlias } from '../../cli/kind-alias.js';

describe('cli/kind-alias', () => {
	it('maps each lowercase alias to its canonical PascalCase NodeKind', () => {
		expect({
			constraint: KIND_ALIAS['constraint'],
			decision: KIND_ALIAS['decision'],
			contract: KIND_ALIAS['contract'],
			openQuestion: KIND_ALIAS['open-question'],
			attempt: KIND_ALIAS['attempt'],
		}).toEqual({
			constraint: 'ConstraintNode',
			decision: 'DecisionNode',
			contract: 'ContractNode',
			openQuestion: 'OpenQuestion',
			attempt: 'Attempt',
		});
	});

	it('resolveKindAlias is case-insensitive and returns null for unknown', () => {
		expect({
			lower: resolveKindAlias('constraint'),
			upper: resolveKindAlias('CONSTRAINT'),
			mixed: resolveKindAlias('Open-Question'),
			unknown: resolveKindAlias('notarealkind'),
		}).toEqual({
			lower: 'ConstraintNode',
			upper: 'ConstraintNode',
			mixed: 'OpenQuestion',
			unknown: null,
		});
	});
});
