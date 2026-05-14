/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/canvas/webview/RationaleChain.tsx — Phase 14 Plan 14-02 (DEEP-01) "Why does this exist?"
// rationale-chain component slotted between DiffPane and CitationList.
//
// Three render branches:
//   1. chain === null && error === null  → "Why does this exist?" request button
//   2. error === 'kernel-degraded'       → degraded-mode message (kernel offline)
//   3. chain !== null                    → ordered list of ConstraintNode + DecisionNode rows
//
// Bitemporal asOf invariant (Pitfall 1 — REC-03): the host extracts the asOf from
// payload.receipt.graph_snapshot_tx_time at message-receive time (NEVER Date.now() at
// click time). This component is pure-presentation; it sends the message and renders
// what comes back. No client-side timestamping.

import * as React from 'react';
import type { RationaleChainEntryForCanvas } from '../messages.js';

export interface RationaleChainProps {
	chain: ReadonlyArray<RationaleChainEntryForCanvas> | null;
	error: 'kernel-degraded' | null;
	onRequest: () => void;
}

export function RationaleChain({ chain, error, onRequest }: RationaleChainProps): React.ReactElement {
	if (error === 'kernel-degraded') {
		return (
			<section className="rationale-chain rationale-chain--degraded" data-testid="rationale-chain-degraded">
				<p>Rationale chain unavailable - kernel is offline. Reconnect to inspect the decisions and constraints behind this file.</p>
			</section>
		);
	}

	if (chain === null) {
		return (
			<section className="rationale-chain rationale-chain--idle">
				<button
					className="rationale-chain__button"
					type="button"
					data-testid="rationale-chain-request"
					onClick={onRequest}
				>
					Why Does This Exist?
				</button>
			</section>
		);
	}

	if (chain.length === 0) {
		return (
			<section className="rationale-chain rationale-chain--empty" data-testid="rationale-chain-empty">
				<p>No rationale found - this file has no anchored constraints or decisions in the graph.</p>
			</section>
		);
	}

	return (
		<section className="rationale-chain" data-testid="rationale-chain">
			<h3 className="rationale-chain__title">Why Does This Exist</h3>
			<ol className="rationale-chain__entries">
				{chain.map((entry) => (
					<li
						key={entry.node_id}
						className={
							entry.invalidated_at !== null
								? 'rationale-chain__entry rationale-chain__entry--superseded'
								: 'rationale-chain__entry'
						}
						data-testid="rationale-chain-entry"
					>
						<span className={`rationale-chain__kind rationale-chain__kind--${entry.kind === 'ConstraintNode' ? 'constraint' : 'decision'}`}>
							{entry.kind === 'ConstraintNode' ? 'Constraint' : 'Decision'}
						</span>
						<span className="rationale-chain__body">{entry.body}</span>
						<span className="rationale-chain__valid-from" title={`valid_from ${entry.valid_from}`}>
							{formatValidFrom(entry.valid_from)}
						</span>
						<span className={`rationale-chain__confidence rationale-chain__confidence--${entry.confidence === 'Explicit' ? 'explicit' : 'inferred'}`}>
							{entry.confidence}
						</span>
						{entry.invalidated_at !== null ? (
							<span className="rationale-chain__superseded" title={`superseded on ${entry.invalidated_at}`}>
								Superseded
							</span>
						) : null}
					</li>
				))}
			</ol>
		</section>
	);
}

function formatValidFrom(iso: string): string {
	try {
		const d = new Date(iso);
		if (Number.isNaN(d.getTime())) {
			return iso;
		}
		// Date-only display; the full ISO is in the title attribute for hover-detail.
		return d.toISOString().slice(0, 10);
	} catch {
		return iso;
	}
}
