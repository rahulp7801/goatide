/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/drift/section-parser.spec.ts — Phase 7 (Plan 07-03) DRIFT-03 section parser.
//
// Tests for the markdown ATX-only section parser. Per Pitfall 2 (07-RESEARCH.md), the parser
// supports ONLY `^#{1,6}\s+text` headings; HTML / setext / blockquoted / code-fence-internal
// headings are silently treated as prose. Each unsupported variant pinned by a negative test.
//
// Plan 07-01 staged 4 it.skip stubs; Plan 07-03 flips them to live tests + adds 7 more
// (nested-containment, fenced-code, CRLF, Unicode, trailing-#, empty-body, multi-section).

import { describe, expect, it } from 'vitest';
import { parseSections } from '../../drift/section-parser.js';

describe('drift/section-parser — Plan 07-03 (DRIFT-03)', () => {
	it('parses ATX H1-H6 headings into name+range tuples', () => {
		const body = [
			'## Authentication',
			'body1',
			'body2',
			'## Notes',
			'body3',
		].join('\n');
		const sections = parseSections(body);
		assertSectionsEqual(sections, {
			Authentication: { startLine: 2, endLine: 3, headingLevel: 2 },
			Notes: { startLine: 5, endLine: 5, headingLevel: 2 },
		});
	});

	it('returns empty map when body has no headings', () => {
		expect(parseSections('').size).toBe(0);
		expect(parseSections('just some prose with no headings\nat all\n').size).toBe(0);
	});

	it('nested headings are children of nearest enclosing top-level section (parent range encompasses child)', () => {
		// Resolution of Open Question #5: a child heading (### under ##) IS part of its parent's
		// range. An edit ONLY to the child's lines overlaps the parent's range, so a lock on the
		// parent name fires when the child's lines are edited.
		const body = [
			'## Auth',          // line 1
			'### Tokens',       // line 2
			'body',              // line 3
			'## Notes',         // line 4
			'note-body',         // line 5
		].join('\n');
		const sections = parseSections(body);
		assertSectionsEqual(sections, {
			Auth: { startLine: 2, endLine: 3, headingLevel: 2 },
			Tokens: { startLine: 3, endLine: 3, headingLevel: 3 },
			Notes: { startLine: 5, endLine: 5, headingLevel: 2 },
		});
		// Parent fully contains child:
		const auth = sections.get('Auth')!;
		const tokens = sections.get('Tokens')!;
		expect(auth.startLine).toBeLessThanOrEqual(tokens.startLine);
		expect(auth.endLine).toBeGreaterThanOrEqual(tokens.endLine);
	});

	it('unsupported HTML headings are silently ignored (Pitfall 2)', () => {
		const sections = parseSections('<h2>HTML Heading</h2>\nbody\n');
		expect(sections.size).toBe(0);
	});

	it('unsupported setext underline headings are silently ignored (Pitfall 2)', () => {
		const sections = parseSections('Setext Heading\n==============\nbody\n');
		expect(sections.size).toBe(0);
	});

	it('unsupported blockquoted headings are silently ignored (Pitfall 2)', () => {
		const sections = parseSections('> ## Quoted Heading\nbody\n');
		expect(sections.size).toBe(0);
	});

	it('headings inside fenced code blocks are silently ignored (Pitfall 2)', () => {
		const body = [
			'## Real Section',
			'```',
			'# Not a heading inside a code fence',
			'## Also not a heading',
			'```',
			'body after fence',
		].join('\n');
		const sections = parseSections(body);
		// Only ONE section: 'Real Section'. The two `#` lines inside the fence are prose.
		expect(sections.size).toBe(1);
		const real = sections.get('Real Section');
		expect(real).toBeDefined();
		// Range covers fence + body line.
		expect(real!.startLine).toBe(2);
		expect(real!.endLine).toBe(6);
	});

	it('accepts trailing closing #s (`## Heading ##`)', () => {
		const sections = parseSections('## Heading ##\nbody\n');
		assertSectionsEqual(sections, {
			Heading: { startLine: 2, endLine: 2, headingLevel: 2 },
		});
	});

	it('normalizes CRLF line endings', () => {
		const sections = parseSections('## Heading\r\nbody\r\n');
		assertSectionsEqual(sections, {
			Heading: { startLine: 2, endLine: 2, headingLevel: 2 },
		});
	});

	it('tolerates Unicode heading text', () => {
		const sections = parseSections('## 認証\nbody\n');
		assertSectionsEqual(sections, {
			'認証': { startLine: 2, endLine: 2, headingLevel: 2 },
		});
	});

	it('top-level H1 encompasses all subsequent lower-level headings until another H1 or EOF', () => {
		const body = [
			'# H1',          // line 1
			'## H2',         // line 2
			'### H3',        // line 3
			'body',          // line 4
			'## Sibling',    // line 5
			'sib-body',       // line 6
		].join('\n');
		const sections = parseSections(body);
		assertSectionsEqual(sections, {
			H1: { startLine: 2, endLine: 6, headingLevel: 1 },
			H2: { startLine: 3, endLine: 4, headingLevel: 2 },
			H3: { startLine: 4, endLine: 4, headingLevel: 3 },
			Sibling: { startLine: 6, endLine: 6, headingLevel: 2 },
		});
	});
});

interface SectionRangeForAssertion {
	startLine: number;
	endLine: number;
	headingLevel: number;
}

function assertSectionsEqual(actual: Map<string, SectionRangeForAssertion>, expected: Record<string, SectionRangeForAssertion>): void {
	const actualObj: Record<string, SectionRangeForAssertion> = {};
	for (const [k, v] of actual.entries()) {
		actualObj[k] = { startLine: v.startLine, endLine: v.endLine, headingLevel: v.headingLevel };
	}
	expect(actualObj).toEqual(expected);
}
