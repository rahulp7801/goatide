/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from 'vitest';
import { classifyTier, DEFAULT_HIGH_IMPACT_CONTRACT_PREFIXES } from '../../canvas/index.js';
import type { CitationDetail, TierClassifierInputs } from '../../canvas/index.js';
import type { ReasoningReceipt } from '../../receipt/index.js';
import { buildSampleDiff } from '../helpers/canvas-fixtures.js';

function makeReceipt(opts: {
	confidences: ('Explicit' | 'Inferred')[];
}): ReasoningReceipt {
	return {
		id: '01J' + 'A'.repeat(23),
		change_id: '01J' + 'B'.repeat(23),
		citations: opts.confidences.map((c, i) => ({
			node_id: '01J' + String(i).repeat(25),
			version: '01J' + String(i).repeat(25),
			confidence: c,
			edge_path: 'parent_of:0',
			snippet: 'rule body',
		})),
		drill_chain: [],
		destructive: false,
		graph_snapshot_tx_time: '2026-04-30T12:00:00.000Z',
	};
}

const PLAIN_DIFF = buildSampleDiff({
	filePath: 'src/auth.ts',
	oldText: 'console.log("a");',
	newText: 'console.log("b");',
});

const DESTRUCTIVE_DIFF = buildSampleDiff({
	filePath: 'src/db/schema.sql',
	oldText: 'CREATE TABLE x;',
	newText: 'DROP TABLE x;',
});

describe('CANV-04 + CANV-05 — tier classifier (5-signal ordered guard chain)', () => {
	it('signal 1: destructive diff returns modal (overrides all soft signals)', () => {
		const inputs: TierClassifierInputs = {
			receipt: makeReceipt({ confidences: ['Explicit', 'Explicit'] }),  // even with all-Explicit (would be silent)
			diff: DESTRUCTIVE_DIFF,
			anchorPath: 'src/db/schema.sql',
		};
		expect(classifyTier(inputs)).toBe('modal');
	});

	it('signal 2: high-impact ContractNode citation returns modal (with citationDetails)', () => {
		const citationDetails: CitationDetail[] = [
			{ node_id: '01JC', kind: 'ContractNode', contract_path: '/contracts/security/auth.md' },
		];
		const inputs: TierClassifierInputs = {
			receipt: makeReceipt({ confidences: ['Explicit'] }),
			diff: PLAIN_DIFF,
			citationDetails,
		};
		expect(classifyTier(inputs)).toBe('modal');
	});

	it('signal 2 negative: ContractNode citation outside allowlist does NOT escalate to modal', () => {
		const citationDetails: CitationDetail[] = [
			{ node_id: '01JC', kind: 'ContractNode', contract_path: '/contracts/style-guide/typography.md' },
		];
		const inputs: TierClassifierInputs = {
			receipt: makeReceipt({ confidences: ['Explicit'] }),
			diff: PLAIN_DIFF,
			citationDetails,
		};
		expect(classifyTier(inputs)).toBe('silent');   // soft path: all-Explicit → silent
	});

	it('signal 3: all-Explicit-promoted citations → silent', () => {
		const inputs: TierClassifierInputs = {
			receipt: makeReceipt({ confidences: ['Explicit', 'Explicit', 'Explicit'] }),
			diff: PLAIN_DIFF,
		};
		expect(classifyTier(inputs)).toBe('silent');
	});

	it('signal 4: any Inferred-unpromoted citation → inline', () => {
		const inputs: TierClassifierInputs = {
			receipt: makeReceipt({ confidences: ['Explicit', 'Inferred'] }),
			diff: PLAIN_DIFF,
		};
		expect(classifyTier(inputs)).toBe('inline');
	});

	it('signal 5: empty citations → silent', () => {
		const inputs: TierClassifierInputs = {
			receipt: makeReceipt({ confidences: [] }),
			diff: PLAIN_DIFF,
		};
		expect(classifyTier(inputs)).toBe('silent');
	});

	it('CANV-05 invariant: every input shape returns a CanvasTier (no undefined / no throw)', () => {
		// Five canonical inputs from above + one minimal:
		const cases: TierClassifierInputs[] = [
			{ receipt: makeReceipt({ confidences: [] }), diff: PLAIN_DIFF },
			{ receipt: makeReceipt({ confidences: ['Explicit'] }), diff: PLAIN_DIFF },
			{ receipt: makeReceipt({ confidences: ['Inferred'] }), diff: PLAIN_DIFF },
			{ receipt: makeReceipt({ confidences: ['Explicit', 'Inferred'] }), diff: PLAIN_DIFF },
			{ receipt: makeReceipt({ confidences: ['Explicit'] }), diff: DESTRUCTIVE_DIFF, anchorPath: 'src/db/schema.sql' },
		];
		const tiers = cases.map(classifyTier);
		expect(tiers.every((t) => t === 'silent' || t === 'inline' || t === 'modal')).toBe(true);
	});

	it('DEFAULT_HIGH_IMPACT_CONTRACT_PREFIXES contains the three Phase-4-default prefixes', () => {
		expect([...DEFAULT_HIGH_IMPACT_CONTRACT_PREFIXES]).toEqual([
			'/contracts/security/',
			'/contracts/api/',
			'/contracts/data/',
		]);
	});
});
