/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/drift/section-parser.spec.ts — Phase 7 (Plan 07-01) Wave-0 RED stubs for DRIFT-03.
//
// Markdown section parser: parses ATX H1-H6 headings into name+range tuples; the lock
// detector consumes ranges to decide whether a diff hunk overlaps an enforcing section.
// 4 it.skip blocks. Plan 07-03 flips. Pitfall 2: HTML / setext / blockquote-prefixed
// headings are explicitly NOT supported (would require a CommonMark parser; out of scope).

import { describe, it } from 'vitest';

describe('drift/section-parser — Plan 07-03 (DRIFT-03)', () => {
	it.skip('parses ATX H1-H6 headings into name+range tuples — Plan 07-03 has not yet implemented parseSections', () => {});
	it.skip('returns empty map when body has no headings — Plan 07-03 has not yet implemented parseSections', () => {});
	it.skip('nested headings are children of nearest enclosing top-level section — Plan 07-03 has not yet implemented parseSections', () => {});
	it.skip('unsupported HTML / setext / blockquote-prefixed headings are ignored (Pitfall 2) — Plan 07-03 has not yet implemented parseSections', () => {});
});
