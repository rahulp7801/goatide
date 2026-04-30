/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/receipt/builder.ts — Phase 3 (Plan 03-03) ReasoningReceipt composer.
//
// Task 1 lands the ReasoningReceipt type so ReceiptDAO can import it; Task 2 fills in
// the buildReceipt function + REC-04 destructive guard + REC-05 cite_eligible filter.

import type { Citation } from './citation.js';

export interface ReasoningReceipt {
	id: string;                            // ULID (26 chars)
	change_id: string;                     // ULID; one receipt per proposed change (REC-01)
	citations: Citation[];
	drill_chain: string[];                 // edge_path strings from traverse result
	destructive: boolean;
	graph_snapshot_tx_time: string;        // REC-03 — ISO-8601 ms precision
}
