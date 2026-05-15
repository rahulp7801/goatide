/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/graph/repo-fingerprint.spec.ts — Phase 16 Plan 16-01 Task 2.
// 4-case GREEN suite: all 4 test bodies GREEN at Wave-0 close by virtue of the real
// fingerprint() body landing in kernel/src/graph/repo-fingerprint.ts this wave.
// VALIDATION.md task row 16-00-06 grep target: verbatim case-name strings.

import { describe, it, expect } from 'vitest';
import { fingerprint } from '../../graph/repo-fingerprint.js';

describe('repo-fingerprint', () => {
	it('returns 12 hex characters', () => {
		const result = fingerprint('https://github.com/x/y.git');
		expect(result).toMatch(/^[0-9a-f]{12}$/);
	});

	it('is deterministic', () => {
		const url = 'https://github.com/acme/project.git';
		expect(fingerprint(url)).toBe(fingerprint(url));
	});

	it('normalizes trailing .git and slashes and case', () => {
		const a = fingerprint('https://github.com/x/y.git');
		const b = fingerprint('https://github.com/x/y/');
		const c = fingerprint('HTTPS://GitHub.com/x/y');
		expect(a).toBe(b);
		expect(b).toBe(c);
	});

	it('distinguishes different URLs', () => {
		expect(fingerprint('a')).not.toBe(fingerprint('b'));
	});
});
