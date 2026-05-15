/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/DriftFindings.tsx
//
// Phase 7 Plan 07-07 — DRIFT-01 sidebar surface. Plan 07-01 shipped a stub; Plan 07-07
// fills the full implementation: labeled card, jump-to-line click handler (postMessage),
// contract-link rendering (resolves contract_node_id via panel-side citation lookup).
//
// Phase 16 Plan 16-04 (DEEP-03) — Gains `constraintLiftEligible` prop (host-computed in
// Plan 16-03 tier-dispatch.ts and threaded onto CanvasShowPayload). When true AND at least
// one citation has cited_payload.kind === 'ConstraintNode', renders a button:
// "What would break if this constraint is lifted?" (Mandate B layer 3 — webview conditional
// render: button absent → no canvas.requestConstraintLift message → no kernel write path).
//
// Returns null when findings is empty so the Canvas DOM stays clean (no leaking <ul>).
// Otherwise renders a labeled card ABOVE the diff pane; clickable rows post a
// reveal_line message that the extension host translates to vscode.window.showTextDocument
// + revealRange (panel.ts handleMessage).

import * as React from 'react';
import type { WebviewRpc } from '../rpc.js';
import type { DriftFindingForCanvas } from '../messages.js';

/** Minimal shape for citations passed to DriftFindings — allows test-supplied cited_payload. */
export interface DriftFindingsCitation {
	cited_payload?: {
		kind?: string;
		node_id?: string;
	};
	node_id?: string;
}

export interface DriftFindingsProps {
	findings: ReadonlyArray<DriftFindingForCanvas>;
	rpc?: WebviewRpc;
	/** Phase 16 Plan 16-04 (DEEP-03) — host-computed eligibility flag (Open Decision 7).
	 *  True when the receipt has at least one ConstraintNode citation (tier-dispatch.ts). */
	constraintLiftEligible?: boolean;
	/** Phase 16 Plan 16-04 (DEEP-03) — citations threaded from App.tsx for defensive
	 *  webview-side ConstraintNode check (Mandate B layer 3). */
	citations?: ReadonlyArray<DriftFindingsCitation>;
}

export function DriftFindings({ findings, rpc, constraintLiftEligible, citations }: DriftFindingsProps): React.ReactElement | null {
	if (findings.length === 0) {
		return null;
	}
	const onClickRow = (f: DriftFindingForCanvas): void => {
		if (rpc !== undefined) {
			rpc.postRevealLine({ file: f.file, line: f.hunk_line });
		}
	};

	// Phase 16 Plan 16-04 (DEEP-03) — resolve the first ConstraintNode citation for the button.
	// Belt-and-suspenders: host-side `constraintLiftEligible` is the primary gate; the
	// cited_payload.kind check is a defensive fallback in case of host-computation bugs.
	// App.tsx passes citations adapted to include cited_payload when constraintLiftEligible,
	// so this check correctly finds the ConstraintNode even for RenderedCitationForCanvas.
	const constraintCitation = constraintLiftEligible
		? (citations ?? []).find((c) => c.cited_payload?.kind === 'ConstraintNode') ?? null
		: null;
	const constraintNodeId = constraintCitation?.cited_payload?.node_id ?? constraintCitation?.node_id ?? null;

	const onConstraintLiftClick = (): void => {
		if (rpc !== undefined && constraintNodeId !== null) {
			rpc.postConstraintLiftRequest({
				constraint_node_id: constraintNodeId,
				max_hops: 3,
				confidence_threshold: 0.5,
			});
		}
	};

	return (
		<section className="drift-findings" data-testid="drift-findings">
			<h3 className="drift-findings-title">Drift Findings ({findings.length})</h3>
			<ul className="drift-findings-list">
				{findings.map((f, idx) => (
					<li
						key={`${f.contract_node_id}-${f.pattern_index}-${f.file}-${f.hunk_line}-${idx}`}
						className="drift-findings-row"
						data-testid="drift-finding-row"
					>
						<button
							className="drift-findings-jump"
							onClick={() => onClickRow(f)}
							title={`Reveal ${f.file}:${f.hunk_line}`}
							data-testid="drift-finding-jump"
						>
							{f.file}:{f.hunk_line}
						</button>
						<span className="drift-findings-message">{f.message}</span>
						<span className="drift-findings-pattern-kind" title={`Contract anchor: ${f.contract_anchor_file}`}>
							{f.pattern_kind}
						</span>
					</li>
				))}
			</ul>
			{/* Phase 16 Plan 16-04 (DEEP-03) — Mandate B layer 3: button renders only when constraintLiftEligible AND a ConstraintNode citation is present. */}
			{constraintLiftEligible && constraintCitation !== null ? (
				<button
					type="button"
					className="drift-findings-constraint-lift-button"
					onClick={onConstraintLiftClick}
					data-testid="drift-findings-constraint-lift-button"
				>
					What would break if this constraint is lifted?
				</button>
			) : null}
		</section>
	);
}

export default DriftFindings;
