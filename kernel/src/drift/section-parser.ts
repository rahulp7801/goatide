/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/drift/section-parser.ts — Phase 7 (Plan 07-03) DRIFT-03 contract section parser.
//
// Pure-function ATX-only markdown heading parser. Walks a contract body line-by-line,
// identifies `^#{1,6}\s+text` headings, and emits a Map<sectionName, SectionRange> where
// each range covers the lines BELOW the heading until the next heading at the same OR
// lower level. Nested headings are children of their enclosing parent — the parent's
// range fully contains the child's range, so a lock on the parent name fires when ANY
// line in the child is edited (Open Question #5 resolution).
//
// Pitfall 2 (07-RESEARCH.md): Hand-rolled CommonMark subset. Full CommonMark would cost a
// 4000-line library. Supported subset is documented below; unsupported variants are
// silently treated as prose so contract authors see predictable behavior. The future
// gate refuse-html-heading-in-contract.sh (research-noted as v1.x) will warn on unsupported
// variants at seed time.
//
// Plan 07-04 (ripple analyzer) does not consume this module directly. Plan 07-07 (bridge
// save-gate) consumes it transitively via lock-detector.ts.

/**
 * Half-open line range [startLine, endLine] (1-indexed, inclusive on both ends) for a
 * section's body. The heading line itself is NOT in the range — `startLine` is the
 * first content line below the heading.
 *
 * For a top-level section that contains nested children, `endLine` extends past child
 * headings to include their bodies (the parent's range encompasses the children's ranges).
 */
export interface SectionRange {
	/** 1-indexed; first content line BELOW the heading. */
	readonly startLine: number;
	/** 1-indexed; last content line of this section (inclusive). For parent sections, includes nested children. */
	readonly endLine: number;
	/** 1..6 — count of leading `#` characters in the ATX heading. */
	readonly headingLevel: number;
}

/**
 * Walk a markdown contract body and produce a Map of section names to line ranges.
 *
 * Supported syntax (per Pitfall 2):
 *   - ATX H1-H6 headings: `^#{1,6}\s+text`. The heading text is trimmed of any trailing
 *     `#` characters and whitespace (so `## Heading ##` → `Heading`).
 *   - Tab-separated heading text (e.g. `#\tHeading`) is accepted.
 *   - Unicode heading text is accepted (the regex is whitespace-anchored, not codepoint-class).
 *   - CRLF line endings are normalized via split(/\r?\n/) at parse time.
 *
 * Unsupported syntax (silently treated as prose; the parser returns 0 sections for these):
 *   - HTML headings: `<h2>...</h2>`.
 *   - Setext underline-style: `Heading\n=====` or `Heading\n-----`.
 *   - Blockquoted headings: `> ## Heading`.
 *   - ATX headings INSIDE fenced code blocks (` ``` ` or `~~~` delimited) are NOT section
 *     starts — the parser tracks fenced-code state and skips heading detection inside fences.
 *
 * Section-range semantics:
 *   - A heading at line L starts a section whose body begins at L+1.
 *   - The section's body extends until the next heading at the SAME OR LOWER level (the
 *     next heading whose level <= this heading's level), OR end-of-file. This means a
 *     parent heading's range encompasses any child headings nested under it.
 *
 * Duplicate-heading-name behavior: if two headings share the same trimmed text, the FIRST
 * occurrence wins; subsequent occurrences are silently shadowed (caller has no way to
 * disambiguate without a positional index). Document this in Plan 07-03 SUMMARY.
 *
 * Empty-section behavior: a heading immediately followed by another heading produces an
 * empty range where startLine > endLine. Such ranges are STILL captured (the lock-detector
 * skips empty ranges naturally because no diff hunk can overlap them).
 *
 * @param body  The full markdown body string. Empty string returns an empty Map.
 * @returns     Map of section name (post-trim heading text) → SectionRange.
 */
export function parseSections(body: string): Map<string, SectionRange> {
	const result = new Map<string, SectionRange>();
	if (body.length === 0) {
		return result;
	}

	const lines = body.split(/\r?\n/);

	// First pass: identify headings (line index + level + name) while tracking fenced-code state.
	const headings: { line: number; level: number; name: string }[] = [];
	let inFencedCode = false;
	const FENCE_RE = /^\s*(```|~~~)/;
	// ATX heading: 1-6 leading `#`, then required whitespace, then text. Optionally trailed
	// by `#` characters and whitespace before EOL. The /u flag enables Unicode-mode (so
	// `\s` matches Unicode whitespace and the regex tolerates non-ASCII heading text).
	const HEADING_RE = /^(#{1,6})\s+(.+?)\s*#*\s*$/u;

	for (let i = 0; i < lines.length; i++) {
		const lineNumber = i + 1;
		const raw = lines[i];

		// Toggle fenced-code state on `\`\`\`` or `~~~` opener/closer lines. The toggle happens
		// AFTER any heading-detection on this line is bypassed — a fence-opener line is itself
		// not a heading regardless.
		if (FENCE_RE.test(raw)) {
			inFencedCode = !inFencedCode;
			continue;
		}
		if (inFencedCode) {
			continue;
		}

		// Reject blockquoted headings (`> ## ...`) — leading `>` characters disqualify.
		// Reject HTML headings (`<h2>...</h2>`) — leading `<` disqualifies.
		// Reject setext-style — those have NO leading `#`, so HEADING_RE simply fails to match.
		const match = HEADING_RE.exec(raw);
		if (!match) {
			continue;
		}
		const level = match[1].length;
		const name = match[2].trim();
		if (name.length === 0) {
			continue;
		}
		headings.push({ line: lineNumber, level, name });
	}

	// Second pass: compute each heading's endLine. For heading at index k with level L, the
	// endLine is (next heading j > k whose level <= L).line - 1, or lines.length if no such j
	// exists. This rule produces the parent-encompasses-child semantics.
	for (let k = 0; k < headings.length; k++) {
		const h = headings[k];
		let endLine = lines.length;
		for (let j = k + 1; j < headings.length; j++) {
			if (headings[j].level <= h.level) {
				endLine = headings[j].line - 1;
				break;
			}
		}
		const startLine = h.line + 1;
		// Duplicate-name shadowing: if a section with this name already exists, do not overwrite.
		if (result.has(h.name)) {
			continue;
		}
		result.set(h.name, {
			startLine,
			endLine,
			headingLevel: h.level,
		});
	}

	return result;
}
