/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/DriftFindings.tsx
//
// Phase 7 Plan 07-01 Wave-0 shell. Plan 07-07 fills full styling + click-to-jump-to-line +
// contract-link rendering + DRIFT-01 SC-#1 sidebar integration.
//
// Wave-0 contract:
//   - Returns null if findings is empty (avoids leaking an empty <ul> into Canvas DOM).
//   - Otherwise renders a labeled <ul> with one <li> per finding showing the message + the
//     contract-path link as plain text. The full hover-to-explain + click-to-jump UX is
//     wired in Plan 07-07 once the kernel side ships DriftFinding via canvas.show payload.

import * as React from 'react';

/**
 * DriftFinding shape — locally inlined at Wave-0 since the kernel side has not yet shipped
 * the canonical type via canvas/messages.ts. Plan 07-07 will replace this with a shared
 * import once kernel/src/drift/detector.ts (Plan 07-02) defines the wire shape and
 * canvas/messages.ts mirrors it (Plan 04-05 CJS↔ESM contract pattern).
 */
export interface DriftFinding {
	contract_path: string;
	pattern_kind: 'regex' | 'jsonpath' | 'forbidden_import';
	message: string;
	file: string;
	line?: number;
}

export interface DriftFindingsProps {
	findings: ReadonlyArray<DriftFinding>;
}

export function DriftFindings({ findings }: DriftFindingsProps): React.ReactElement | null {
	if (findings.length === 0) {
		return null;
	}
	return (
		<section className="drift-findings" data-testid="drift-findings">
			<h3 className="drift-findings-title">Drift Findings</h3>
			<ul className="drift-findings-list">
				{findings.map((f, idx) => (
					<li key={`${f.contract_path}-${f.file}-${idx}`} className="drift-findings-row" data-testid="drift-finding-row">
						<span className="drift-findings-message">{f.message}</span>
						<span className="drift-findings-anchor">{f.file}{f.line !== undefined ? `:${f.line}` : ''}</span>
						<span className="drift-findings-contract" title={f.contract_path}>{f.contract_path}</span>
					</li>
				))}
			</ul>
		</section>
	);
}

export default DriftFindings;
