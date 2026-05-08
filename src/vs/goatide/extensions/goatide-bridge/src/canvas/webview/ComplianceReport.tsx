/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/ComplianceReport.tsx
//
// Phase 7 Plan 07-07 — DRIFT-04 + DRIFT-05 modal-tier compliance report. Plan 07-01 shipped
// a stub; Plan 07-07 fills the full progressive-disclosure UI.
//
// Behavior:
//   - First paint: receives `report` prop (initial first-degree partial OR null when the
//     50ms Promise.race timed out). When null, renders the loading spinner only.
//   - Listens for compliance_report.partial and compliance_report.full webview messages
//     and merges deeper hops into the report state via setState. CSS transition fades the
//     new rows in (styles.css owns the animation; this component owns the data flow).
//   - Three labeled buckets: Definitely Affected (count), Potentially Affected (count),
//     Loading deeper hops (spinner if loadingDeeperHops). Truncated banner appears when
//     the kernel-side nodeCap fired.
//
// Returns null on `null` report AND loadingDeeperHops=false (Canvas hides the section).

import * as React from 'react';
import { useEffect, useState } from 'react';
import type { ComplianceReportForCanvas, ComplianceRowForCanvas } from '../messages.js';
import { OverrideButton, type OverrideButtonProps } from './OverrideButton.js';

export interface ComplianceReportProps {
	report: ComplianceReportForCanvas | null;
	overrideProps?: OverrideButtonProps;
}

export function ComplianceReportView({ report: initialReport, overrideProps }: ComplianceReportProps): React.ReactElement | null {
	const [report, setReport] = useState<ComplianceReportForCanvas | null>(initialReport);
	const [loadingDeeperHops, setLoadingDeeperHops] = useState<boolean>(initialReport === null || initialReport.max_hops < 3);

	useEffect(() => {
		// When parent's initialReport prop changes, re-sync local state. This handles the
		// canvas.show → first paint transition where the parent's payload changes.
		setReport(initialReport);
		setLoadingDeeperHops(initialReport === null || initialReport.max_hops < 3);
	}, [initialReport]);

	useEffect(() => {
		const handler = (event: MessageEvent): void => {
			const data = event.data as { type?: string; payload?: { report?: ComplianceReportForCanvas } };
			if (data?.type === 'compliance_report.partial' && data.payload?.report !== undefined) {
				// Partial — only update if we don't have a final yet (max_hops < 3).
				const incoming = data.payload.report;
				setReport((prev) => {
					if (prev !== null && prev.max_hops === 3) {
						return prev;
					}
					return incoming;
				});
				setLoadingDeeperHops(true);
			} else if (data?.type === 'compliance_report.full' && data.payload?.report !== undefined) {
				setReport(data.payload.report);
				setLoadingDeeperHops(false);
			}
		};
		window.addEventListener('message', handler);
		return () => window.removeEventListener('message', handler);
	}, []);

	if (report === null && !loadingDeeperHops) {
		return null;
	}

	return (
		<section className="compliance-report" data-testid="compliance-report">
			<h3 className="compliance-report-title">
				Compliance Report{report !== null ? ` — ${report.contract_node_id.slice(-6)}` : ''}
			</h3>
			{report !== null ? (
				<>
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
					{report.truncated ? (
						<div className="compliance-report-truncated" data-testid="compliance-report-truncated">
							Showing first {report.definitely_affected.length + report.potentially_affected.length} affected nodes — refine the contract or raise GOATIDE_DRIFT_NODE_CAP.
						</div>
					) : null}
				</>
			) : null}
			{loadingDeeperHops ? (
				<div className="compliance-report-loading" data-testid="compliance-report-loading">
					{report === null ? 'Computing first-degree blast radius…' : 'Loading deeper hops…'}
				</div>
			) : null}
			{overrideProps !== undefined ? (
				<footer className="compliance-report-footer">
					<OverrideButton {...overrideProps} />
				</footer>
			) : null}
		</section>
	);
}

interface BucketProps {
	title: string;
	rows: ReadonlyArray<ComplianceRowForCanvas>;
	variant: 'definitely' | 'potentially';
}

function Bucket({ title, rows, variant }: BucketProps): React.ReactElement {
	return (
		<div
			className={`compliance-report-bucket compliance-report-${variant} compliance-bucket-${variant === 'definitely' ? 'definitely' : 'potentially'}`}
			data-testid={`bucket-${variant}`}
		>
			<h4 className="compliance-report-bucket-title">{title} ({rows.length})</h4>
			{rows.length === 0 ? (
				<div className="compliance-report-empty">None.</div>
			) : (
				<ul className="compliance-report-rows">
					{rows.map((r) => (
						<li key={r.node_id} className="compliance-report-row" data-testid="compliance-report-row">
							<span className="compliance-report-kind">{r.kind}</span>
							<span className="compliance-report-edge-path" title={r.edge_path}>{r.edge_path}</span>
							<span className="compliance-report-body">{r.body_preview}</span>
							{r.anchor_file ? (
								<span className="compliance-report-path" title={r.anchor_file}>{r.anchor_file}</span>
							) : null}
						</li>
					))}
				</ul>
			)}
		</div>
	);
}

export default ComplianceReportView;
