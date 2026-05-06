/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/canvas/destructive.ts — Phase 4 (Plan 04-02) destructive-pattern detector.
//
// Per 04-RESEARCH.md ## Pattern: Destructive Detection. Pure regex scan over the unified-diff
// string + optional anchor path. CANV-08: destructive saves force the modal tier and require
// a confirmation phrase echoing the destructive verb.
//
// Anti-foot-gun: defense-in-depth. The classifier consumes detectDestructive AS ONE SIGNAL;
// the kernel's REC-04 destructive guard (Phase 3, builder.ts) is a SEPARATE refusal that triggers
// on receipts cited only by Inferred. A clever diff can smuggle a destructive op past these
// regexes; manual code review is the third line of defense (RESEARCH ## Anti-Patterns).

/**
 * Regex set for destructive content INSIDE a diff. Each regex is anchored to ^[+-] so it only
 * matches added/removed lines (not context). The /m flag makes ^ match line starts in a multi-line
 * diff string. /i for SQL keywords (case-insensitive); shell verbs are case-sensitive (`rm` is
 * always lowercase in practice).
 */
export const DESTRUCTIVE_DIFF_PATTERNS: readonly RegExp[] = [
	/^[+-].*\brm\s+-[a-zA-Z]*r[a-zA-Z]*\b/m,     // shell rm -r / rm -rf / rm -rfv / rm -fr (any flag combo containing r)
	/^[+-].*\bDROP\s+TABLE\b/im,                 // SQL DROP TABLE
	/^[+-].*\bDROP\s+DATABASE\b/im,              // SQL DROP DATABASE
	/^[+-].*\bDROP\s+INDEX\b/im,                 // SQL DROP INDEX
	/^[+-].*\bTRUNCATE\b/im,                     // SQL TRUNCATE
	/^[+-].*\bdelete\s+from\b/im,                // SQL DELETE FROM
	/^[+-].*\bgit\s+revert\b/m,                  // git revert (in scripts)
	/^[+-].*\bgit\s+reset\s+--hard\b/m,          // git reset --hard
];

/**
 * File path patterns that are destructive surfaces by convention. The presence of a save against
 * a path matching any of these forces the modal tier even if the diff body is benign.
 */
export const DESTRUCTIVE_PATH_PATTERNS: readonly RegExp[] = [
	/\/migrations\/[^/]+\.(sql|ts)$/i,           // schema migrations
	/\.env(\.[^/]+)?$/,                          // .env, .env.local, .env.production
];

/**
 * Verbs we may echo back to the developer in the CANV-08 confirmation phrase.
 * Order matters: scan in this order; first match wins.
 */
const DESTRUCTIVE_VERBS: readonly string[] = ['drop', 'delete', 'rm', 'revert', 'truncate'];

/**
 * Return true if the diff (or its anchor path) is destructive.
 *
 * @param diff       Unified-diff string from the bridge's onWillSaveTextDocument capture.
 * @param anchorPath Optional file path; if provided, also check DESTRUCTIVE_PATH_PATTERNS.
 */
export function detectDestructive(diff: string, anchorPath?: string): boolean {
	for (const pat of DESTRUCTIVE_DIFF_PATTERNS) {
		if (pat.test(diff)) {
			return true;
		}
	}
	if (anchorPath) {
		for (const pat of DESTRUCTIVE_PATH_PATTERNS) {
			if (pat.test(anchorPath)) {
				return true;
			}
		}
	}
	return false;
}

/**
 * Pick a verb to echo in the confirmation-phrase modal: `Type "<verb>" to proceed`.
 * Falls back to the literal 'destructive' if no verb matches but detectDestructive returned true
 * (i.e. only the path-pattern triggered).
 */
export function destructiveVerbForConfirmation(diff: string): string {
	for (const verb of DESTRUCTIVE_VERBS) {
		const re = new RegExp(`\\b${verb}\\b`, 'i');
		if (re.test(diff)) {
			return verb;
		}
	}
	return 'destructive';
}
