/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/graph/anchor.ts — Phase 3 (Plan 03-02) deterministic anchor resolver.
//
// Per 03-RESEARCH.md ## Pattern: Deterministic Anchor Resolver. EXACT EQUALITY ONLY.
//
// MANDATE C — Scope-Constrained Retrieval. There is NO LIKE, NO GLOB, NO LOWER(), NO TRIM().
// If the developer's anchor (file path / symbol name / ticket id) doesn't exactly match a
// node's payload.anchor field, the answer is the empty array. There is no suggestion engine.
// There is no fuzzy fallback. There is no vector-distance similarity. The CI gate
// `scripts/ci/refuse-fuzzy-fallback.sh` catches any future contributor who imports a
// fuzzy library; this module's contract is the human-discipline backstop.

import type { GraphDAO, NodeRow } from './dao.js';

/**
 * Discriminated input for anchor resolution. The four kinds enumerate every legitimate
 * "where am I in the graph?" question a deterministic IDE can ask.
 */
export type AnchorRequest =
	| { kind: 'file'; path: string }
	| { kind: 'symbol'; symbol: string }
	| { kind: 'ticket'; id: string }
	| { kind: 'node_id'; id: string };

/**
 * Resolve an anchor request to the matching node rows, active as of `asOf`.
 *
 * @returns NodeRow[] — at most one for kind:'node_id'; possibly many for the other kinds
 *          (e.g., multiple ConstraintNodes anchored to the same file).
 *          Returns [] when nothing matches — Mandate C, no fallback.
 */
export function resolveAnchor(dao: GraphDAO, req: AnchorRequest, asOf: string): NodeRow[] {
	switch (req.kind) {
		case 'node_id': {
			const n = dao.queryById(req.id);
			return n ? [n] : [];
		}
		case 'file':
			return dao.queryByAnchor({ jsonPath: '$.anchor.file', value: req.path }, asOf);
		case 'symbol':
			return dao.queryByAnchor({ jsonPath: '$.anchor.symbol', value: req.symbol }, asOf);
		case 'ticket':
			return dao.queryByAnchor({ jsonPath: '$.anchor.ticket_id', value: req.id }, asOf);
	}
}
