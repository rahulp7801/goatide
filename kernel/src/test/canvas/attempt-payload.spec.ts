/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { describe, it, expect } from 'vitest';
import { AttemptPayload } from '../../graph/index.js';
import { CanvasTierSchema } from '../../canvas/index.js';

describe('CANV-09 — AttemptPayload extension (accept_latency_ms + tier)', () => {
	it('accepts a Phase-4 attempt with all new optional fields', () => {
		const result = AttemptPayload.safeParse({
			kind: 'Attempt',
			body: 'accepted by developer',
			anchor: { file: 'src/auth.ts' },
			attempt_kind: 'accepted',
			accept_latency_ms: 1234,
			tier: 'modal',
		});
		expect(result.success).toBe(true);
	});

	it('accepts a Phase-2-style attempt without the new fields (backward compat)', () => {
		const result = AttemptPayload.safeParse({
			kind: 'Attempt',
			body: 'legacy attempt',
			anchor: { file: 'src/auth.ts' },
			attempt_kind: 'accepted',
		});
		expect(result.success).toBe(true);
	});

	it('rejects negative accept_latency_ms', () => {
		const result = AttemptPayload.safeParse({
			kind: 'Attempt',
			body: 'attempt',
			anchor: { file: 'src/auth.ts' },
			accept_latency_ms: -1,
		});
		expect(result.success).toBe(false);
	});

	it('rejects an unknown tier string', () => {
		const result = AttemptPayload.safeParse({
			kind: 'Attempt',
			body: 'attempt',
			anchor: { file: 'src/auth.ts' },
			tier: 'destructive-modal',  // not one of silent/inline/modal
		});
		expect(result.success).toBe(false);
	});

	it('AttemptTierEnum (in payloads.ts) and CanvasTierSchema (in canvas/types.ts) accept the SAME three values', () => {
		// Cross-check: structural equality of the duplicated enum literal across the layering boundary.
		const inputs = ['silent', 'inline', 'modal', 'unknown'];
		const fromCanvas = inputs.map((v) => CanvasTierSchema.safeParse(v).success);
		const fromAttempt = inputs.map((v) => AttemptPayload.safeParse({
			kind: 'Attempt', body: 'x', anchor: { file: 'a' }, tier: v,
		}).success);
		expect(fromCanvas).toEqual([true, true, true, false]);
		expect(fromAttempt).toEqual([true, true, true, false]);
	});
});
