/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/drift/patterns.ts — Phase 7 (Plan 07-02) DRIFT-01 pure-function pattern
// evaluators.
//
// Three evaluators, one per DriftPattern variant. Every function is:
//   - synchronous (no async, no Promise)
//   - side-effect-free (no IO, no DB, no network — only console.warn for fail-open
//     malformed-JSON case)
//   - deterministic (same inputs → same output, byte-for-byte)
//
// Mandate-C: exact-equality only. ZERO LLM, ZERO embeddings, ZERO string-similarity.
// scripts/ci/refuse-fuzzy-pattern-fallback.sh statically guards against banned imports.
//
// Pitfall 1 (07-RESEARCH.md): the per-pattern `scope` field is the false-positive defense.
// Behavior:
//   - if pattern.scope is set, the file path must match the glob (matchesScopeGlob).
//   - if pattern.scope is undefined, the pattern only fires when filePath === anchorFile
//     (contract-anchor-defaulting). This matches the JSDoc on
//     kernel/src/graph/payloads.ts ContractPayload.patterns.

import type { DriftPatternT } from '../graph/payloads.js';
import type { DriftFinding } from './types.js';

/** Input shape for added-line iteration — produced by detector.ts from parsePatch hunks. */
export interface AddedLine {
	/** Line content WITHOUT the leading '+' diff marker. */
	readonly line: string;
	/** 1-based line number in the new file. */
	readonly lineNumber: number;
}

type RegexPattern = Extract<DriftPatternT, { kind: 'regex' }>;
type JsonpathPattern = Extract<DriftPatternT, { kind: 'jsonpath' }>;
type ForbiddenImportPattern = Extract<DriftPatternT, { kind: 'forbidden_import' }>;

/**
 * Hand-rolled minimal glob matcher — supported subset (intentional Mandate-C minimalism):
 *   - `**`/x → matches any path containing `/x` after any number of intermediate dirs
 *   - `* `   → matches any single path segment
 *   - exact-equality otherwise
 *
 * If the glob contains no wildcard characters, fall back to exact-equality (the simplest
 * and safest interpretation). The supported subset covers the 3 fixture patterns
 * (`src/app/api/**\/*.ts`, `src/styles/tokens/**\/*.json`, etc.) and is documented here
 * so the developer reading a `scope` value can predict its behavior.
 */
function matchesScopeGlob(glob: string, filePath: string): boolean {
	if (!glob.includes('*')) {
		return glob === filePath;
	}
	// Translate: `.` → `\.`, `**` → `.*`, `*` → `[^/]*`. Anchor at both ends.
	let regexSource = '';
	let i = 0;
	while (i < glob.length) {
		const ch = glob[i];
		if (ch === '*' && glob[i + 1] === '*') {
			regexSource += '.*';
			i += 2;
		} else if (ch === '*') {
			regexSource += '[^/]*';
			i += 1;
		} else if ('.+?^$(){}|[]\\'.includes(ch)) {
			regexSource += '\\' + ch;
			i += 1;
		} else {
			regexSource += ch;
			i += 1;
		}
	}
	const re = new RegExp('^' + regexSource + '$');
	return re.test(filePath);
}

/**
 * Resolve scope: if pattern.scope is set, use the glob matcher; otherwise the pattern only
 * fires when filePath === anchorFile (contract-anchor-defaulting; Pitfall 1 defense).
 */
function inScope(scope: string | undefined, filePath: string, anchorFile: string): boolean {
	if (scope === undefined) {
		return filePath === anchorFile;
	}
	return matchesScopeGlob(scope, filePath);
}

/**
 * Escape regex metacharacters for safe construction of a literal-string match pattern.
 * Used by evalForbiddenImport to embed pattern.module in the import-form regex.
 */
function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Evaluate a regex DriftPattern against the added lines of a single file's hunk(s).
 *
 * Behavior:
 *   - required:true: scan all added lines; if NONE match, emit ONE finding anchored at the
 *     last added line (the "site" the developer would click to investigate).
 *   - required:false (forbidden): scan all added lines; emit ONE finding per matching line.
 *   - scope mismatch (Pitfall 1): return [] without scanning.
 *
 * Findings are returned sorted by hunk_line ascending (deterministic ordering).
 */
export function evalRegexPattern(
	addedLines: readonly AddedLine[],
	pattern: RegexPattern,
	filePath: string,
	contractAnchorFile: string,
	contractNodeId: string,
	patternIndex: number,
): DriftFinding[] {
	if (!inScope(pattern.scope, filePath, contractAnchorFile)) {
		return [];
	}
	const re = new RegExp(pattern.pattern);
	if (pattern.required) {
		// Required-but-missing: emit ONE finding if no added line matches.
		const anyMatches = addedLines.some((al) => re.test(al.line));
		if (anyMatches) {
			return [];
		}
		// Anchor at the last added line; if there are no added lines at all, anchor at 0.
		const last = addedLines[addedLines.length - 1];
		const hunkLine = last ? last.lineNumber : 0;
		return [{
			contract_node_id: contractNodeId,
			contract_anchor_file: contractAnchorFile,
			pattern_index: patternIndex,
			pattern_kind: 'regex',
			file: filePath,
			hunk_line: hunkLine,
			message: 'Required pattern not present in added lines',
		}];
	}
	// Forbidden: one finding per matching added line.
	const findings: DriftFinding[] = [];
	for (const al of addedLines) {
		if (re.test(al.line)) {
			findings.push({
				contract_node_id: contractNodeId,
				contract_anchor_file: contractAnchorFile,
				pattern_index: patternIndex,
				pattern_kind: 'regex',
				file: filePath,
				hunk_line: al.lineNumber,
				message: `Forbidden pattern matched: ${pattern.pattern}`,
			});
		}
	}
	findings.sort((a, b) => a.hunk_line - b.hunk_line);
	return findings;
}

/**
 * Walk a parsed JSON value along a `$.foo.bar[N].baz` style path. Supports:
 *   - dot-separated keys: `$.color.primary.light`
 *   - numeric array indices: `$.spacing[0]`
 *   - wildcards: `$.color.*.light` (star-segment) and `$.spacing[*]` (star-array-element)
 *
 * Wildcard expansion produces multiple resolved values; non-wildcard paths produce 0 or 1.
 *
 * Returns a list of resolved values. Missing-path produces [] (interpreted by the caller
 * as "exists check fails").
 */
function resolveJsonpath(root: unknown, path: string): unknown[] {
	if (!path.startsWith('$')) {
		return [];
	}
	// Tokenize after the '$'.
	const rest = path.slice(1);
	// Split on '.' but treat `[N]` and `[*]` as separate steps.
	const tokens: Array<{ kind: 'key' | 'index' | 'star-key' | 'star-index'; value?: string | number }> = [];
	let i = 0;
	while (i < rest.length) {
		const ch = rest[i];
		if (ch === '.') {
			i += 1;
			let key = '';
			while (i < rest.length && rest[i] !== '.' && rest[i] !== '[') {
				key += rest[i];
				i += 1;
			}
			if (key === '*') {
				tokens.push({ kind: 'star-key' });
			} else if (key.length > 0) {
				tokens.push({ kind: 'key', value: key });
			}
		} else if (ch === '[') {
			const closeIdx = rest.indexOf(']', i);
			if (closeIdx < 0) {
				return [];
			}
			const inner = rest.slice(i + 1, closeIdx);
			if (inner === '*') {
				tokens.push({ kind: 'star-index' });
			} else {
				const n = Number(inner);
				if (!Number.isFinite(n)) {
					return [];
				}
				tokens.push({ kind: 'index', value: n });
			}
			i = closeIdx + 1;
		} else {
			// Bare token at start (no leading dot or bracket) — treat as a key.
			let key = '';
			while (i < rest.length && rest[i] !== '.' && rest[i] !== '[') {
				key += rest[i];
				i += 1;
			}
			if (key.length > 0) {
				tokens.push({ kind: 'key', value: key });
			}
		}
	}

	let cursors: unknown[] = [root];
	for (const token of tokens) {
		const next: unknown[] = [];
		for (const c of cursors) {
			if (c === null || c === undefined) {
				continue;
			}
			if (token.kind === 'key' && typeof token.value === 'string') {
				if (typeof c === 'object' && !Array.isArray(c) && token.value in (c as Record<string, unknown>)) {
					next.push((c as Record<string, unknown>)[token.value]);
				}
			} else if (token.kind === 'star-key') {
				if (typeof c === 'object' && !Array.isArray(c) && c !== null) {
					for (const v of Object.values(c as Record<string, unknown>)) {
						next.push(v);
					}
				}
			} else if (token.kind === 'index' && typeof token.value === 'number') {
				if (Array.isArray(c) && token.value < c.length) {
					next.push(c[token.value]);
				}
			} else if (token.kind === 'star-index') {
				if (Array.isArray(c)) {
					for (const v of c) {
						next.push(v);
					}
				}
			}
		}
		cursors = next;
	}
	return cursors;
}

/**
 * Evaluate a jsonpath DriftPattern against a JSON file.
 *
 * - Skips files that don't end in .json or .jsonc (defensive non-JSON guard — we only fire
 *   on what we can parse).
 * - Wraps JSON.parse in try/catch; on malformed input, console.warn + return [] (fail open;
 *   precedent from Phase-3 Mandate-C empty-result-on-failure).
 * - op='exists': resolved.length === 0 → finding.
 * - op='eq':     any resolved value !== pattern.value → finding (anchor on first mismatch).
 * - op='in':     any resolved value not in pattern.value array → finding.
 *
 * Anchor finding at hunk_line=0 since jsonpath is whole-file, not per-line.
 */
export function evalJsonpathPattern(
	jsonText: string,
	pattern: JsonpathPattern,
	filePath: string,
	contractAnchorFile: string,
	contractNodeId: string,
	patternIndex: number,
): DriftFinding[] {
	if (!filePath.endsWith('.json') && !filePath.endsWith('.jsonc')) {
		return [];
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(jsonText);
	} catch (err) {
		console.warn(`drift/patterns.evalJsonpathPattern: failed to parse JSON in ${filePath}: ${(err as Error).message} — failing open`);
		return [];
	}
	const resolved = resolveJsonpath(parsed, pattern.path);
	const baseFinding = {
		contract_node_id: contractNodeId,
		contract_anchor_file: contractAnchorFile,
		pattern_index: patternIndex,
		pattern_kind: 'jsonpath' as const,
		file: filePath,
		hunk_line: 0,
	};
	if (pattern.op === 'exists') {
		if (resolved.length === 0) {
			return [{
				...baseFinding,
				message: `jsonpath exists check failed for path ${pattern.path}`,
			}];
		}
		return [];
	}
	if (pattern.op === 'eq') {
		// All resolved values must equal pattern.value. Empty resolved is treated as "missing"
		// — also a violation under op='eq' (eq presupposes presence).
		if (resolved.length === 0) {
			return [{
				...baseFinding,
				message: `jsonpath eq check: path ${pattern.path} not present`,
			}];
		}
		for (const v of resolved) {
			if (!deepEqual(v, pattern.value)) {
				return [{
					...baseFinding,
					message: `jsonpath eq check failed for path ${pattern.path}: expected ${JSON.stringify(pattern.value)}, got ${JSON.stringify(v)}`,
				}];
			}
		}
		return [];
	}
	// op === 'in'
	const allowList = pattern.value;
	if (!Array.isArray(allowList)) {
		// Mis-authored pattern; fail open with a warning so authors notice.
		console.warn(`drift/patterns.evalJsonpathPattern: op='in' but pattern.value is not an array (path=${pattern.path}) — failing open`);
		return [];
	}
	if (resolved.length === 0) {
		return [{
			...baseFinding,
			message: `jsonpath in check: path ${pattern.path} not present`,
		}];
	}
	for (const v of resolved) {
		if (!allowList.some((allowed) => deepEqual(allowed, v))) {
			return [{
				...baseFinding,
				message: `jsonpath in check failed for path ${pattern.path}: ${JSON.stringify(v)} not in ${JSON.stringify(allowList)}`,
			}];
		}
	}
	return [];
}

function deepEqual(a: unknown, b: unknown): boolean {
	if (a === b) {
		return true;
	}
	if (typeof a !== typeof b) {
		return false;
	}
	if (a === null || b === null) {
		return false;
	}
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) {
			return false;
		}
		for (let i = 0; i < a.length; i++) {
			if (!deepEqual(a[i], b[i])) {
				return false;
			}
		}
		return true;
	}
	if (typeof a === 'object' && typeof b === 'object') {
		const ao = a as Record<string, unknown>;
		const bo = b as Record<string, unknown>;
		const akeys = Object.keys(ao);
		const bkeys = Object.keys(bo);
		if (akeys.length !== bkeys.length) {
			return false;
		}
		for (const k of akeys) {
			if (!deepEqual(ao[k], bo[k])) {
				return false;
			}
		}
		return true;
	}
	return false;
}

/**
 * Evaluate a forbidden_import DriftPattern against added lines.
 *
 * Detects two import forms:
 *   - ES6:        `import X from 'banned-module';` or `import 'banned-module';`
 *   - CommonJS:   `const X = require('banned-module');`
 *
 * Comment mentions and other non-import string occurrences do NOT fire (the regex anchors
 * on `from` / `require(`).
 *
 * Scope: forbidden_import patterns have NO scope field on the schema; the contract's
 * anchor file is the implicit scope (contract-anchor-defaulting).
 */
export function evalForbiddenImport(
	addedLines: readonly AddedLine[],
	pattern: ForbiddenImportPattern,
	filePath: string,
	contractAnchorFile: string,
	contractNodeId: string,
	patternIndex: number,
): DriftFinding[] {
	if (!inScope(undefined, filePath, contractAnchorFile)) {
		return [];
	}
	const moduleRe = escapeRegex(pattern.module);
	// ES form: `import ... from 'mod'` OR bare `import 'mod'`.
	const importRe = new RegExp(
		`^\\s*import\\s+(?:[^'"\\n]+\\s+from\\s+)?['"]${moduleRe}['"]\\s*;?\\s*$`,
	);
	// CommonJS: anywhere on the line, `require('mod')` or `require("mod")`.
	const requireRe = new RegExp(`require\\(\\s*['"]${moduleRe}['"]\\s*\\)`);
	const findings: DriftFinding[] = [];
	for (const al of addedLines) {
		if (importRe.test(al.line) || requireRe.test(al.line)) {
			findings.push({
				contract_node_id: contractNodeId,
				contract_anchor_file: contractAnchorFile,
				pattern_index: patternIndex,
				pattern_kind: 'forbidden_import',
				file: filePath,
				hunk_line: al.lineNumber,
				message: `Forbidden import: ${pattern.module}`,
			});
		}
	}
	findings.sort((a, b) => a.hunk_line - b.hunk_line);
	return findings;
}
