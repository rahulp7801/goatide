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
// Returns null when findings is empty so the Canvas DOM stays clean (no leaking <ul>).
// Otherwise renders a labeled card ABOVE the diff pane; clickable rows post a
// reveal_line message that the extension host translates to vscode.window.showTextDocument
// + revealRange (panel.ts handleMessage).

import * as React from 'react';
import type { WebviewRpc } from '../rpc.js';
import type { DriftFindingForCanvas } from '../messages.js';

export interface DriftFindingsProps {
	findings: ReadonlyArray<DriftFindingForCanvas>;
	rpc?: WebviewRpc;
}

export function DriftFindings({ findings, rpc }: DriftFindingsProps): React.ReactElement | null {
	if (findings.length === 0) {
		return null;
	}
	const onClickRow = (f: DriftFindingForCanvas): void => {
		if (rpc !== undefined) {
			rpc.postRevealLine({ file: f.file, line: f.hunk_line });
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
		</section>
	);
}

export default DriftFindings;
