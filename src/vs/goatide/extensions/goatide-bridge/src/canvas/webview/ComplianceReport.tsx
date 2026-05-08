/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/ComplianceReport.tsx
//
// Phase 7 Plan 07-01 Wave-0 shell. Plan 07-07 fills full progressive-disclosure UI +
// override button + DRIFT-04 / DRIFT-05 SC-#3 + SC-#5 integration.
//
// Wave-0 contract:
//   - Returns null if report is null (Canvas hides the section when no contract lock fires).
//   - Otherwise renders three labeled buckets (definitely_affected / potentially_affected /
//     loading). Plan 07-07 will: add the override button + note input; wire progressive
//     disclosure (first paint = definitely_affected only; potentially_affected streams in
//     after); wire CSS variables for host theme integration.

import * as React from 'react';

/**
 * ComplianceReport shape — locally inlined at Wave-0. Plan 07-07 replaces this with a
 * shared import from canvas/messages.ts once kernel/src/drift/ripple.ts (Plan 07-04)
 * defines the wire shape.
 */
export interface ComplianceReport {
	contract_node_id: string;
	contract_path: string;
	definitely_affected: ReadonlyArray<{ node_id: string; label: string; path?: string }>;
	potentially_affected: ReadonlyArray<{ node_id: string; label: string; path?: string }>;
	truncated?: boolean;
	truncated_at?: number;
}

export interface ComplianceReportProps {
	report: ComplianceReport | null;
	loadingDeeperHops?: boolean;
}

export function ComplianceReportView({ report, loadingDeeperHops }: ComplianceReportProps): React.ReactElement | null {
	if (report === null) {
		return null;
	}
	return (
		<section className="compliance-report" data-testid="compliance-report">
			<h3 className="compliance-report-title">Compliance Report — {report.contract_path}</h3>
			<Bucket
				title="Definitely Affected"
				rows={report.definitely_affected}
				variant="definitely"
			/>
			<Bucket
				title="Potentially Affected"
				rows={report.potentially_affected}
				variant="potentially"
			/>
			{loadingDeeperHops ? (
				<div className="compliance-report-loading" data-testid="compliance-report-loading">
					Loading deeper hops…
				</div>
			) : null}
			{report.truncated ? (
				<div className="compliance-report-truncated" data-testid="compliance-report-truncated">
					Showing {report.truncated_at ?? '?'} of N — refine the contract or raise node_cap.
				</div>
			) : null}
		</section>
	);
}

interface BucketProps {
	title: string;
	rows: ReadonlyArray<{ node_id: string; label: string; path?: string }>;
	variant: 'definitely' | 'potentially';
}

function Bucket({ title, rows, variant }: BucketProps): React.ReactElement {
	return (
		<div className={`compliance-report-bucket compliance-report-${variant}`} data-testid={`bucket-${variant}`}>
			<h4 className="compliance-report-bucket-title">{title}</h4>
			{rows.length === 0 ? (
				<div className="compliance-report-empty">None.</div>
			) : (
				<ul className="compliance-report-rows">
					{rows.map((r) => (
						<li key={r.node_id} className="compliance-report-row" data-testid="compliance-report-row">
							<span className="compliance-report-label">{r.label}</span>
							{r.path ? <span className="compliance-report-path" title={r.path}>{r.path}</span> : null}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

export default ComplianceReportView;
