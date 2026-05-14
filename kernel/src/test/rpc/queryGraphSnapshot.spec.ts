/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/rpc/queryGraphSnapshot.spec.ts — Phase 15 Plan 15-01 (Wave-0 RED).
//
// RED (it.skip): Wave-1 (Plan 15-02) flips .skip -> live assertions + handler registration.
// Case-name strings below are LOCKED — Plan 15-02 must byte-match.
//
// The Wave-0 plan ships placeholder .skip cases so vitest discovery reports them as
// `pending`; flipping each case to a live `it()` with assertions is the Wave-1 contract.

import { describe, it } from 'vitest';

describe('graph.queryGraphSnapshot RPC', () => {
	it.skip('returns nodes + edges + truncated=false at given asOf', () => {
		/* Plan 15-02 fills body — handler registration + dao.queryAsOf / queryEdgesAsOf
		 * composition + projection to SerializedNodeSnapshot / SerializedEdgeSnapshot. */
	});

	it.skip('truncates to max_nodes when nodeRows exceeds the cap', () => {
		/* Plan 15-02 fills body — seed N+1 nodes, query with max_nodes=N, assert
		 * truncated: true and nodes.length === N. */
	});

	it.skip('bitemporal — superseded at past asOf visible, at future asOf invisible', () => {
		/* Plan 15-02 fills body — seed + supersede + queryGraphSnapshot at two asOf
		 * timestamps; the superseded row visible at past, invisible at future. */
	});
});
