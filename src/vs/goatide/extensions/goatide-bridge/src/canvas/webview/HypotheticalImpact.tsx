/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 16 Plan 16-04 DEEP-03 — Hypothetical Impact section.
//
// Wraps the existing ComplianceReportView (Phase 7) with:
//  - "Hypothetical" badge (--vscode-editorWarning-foreground accent, mirrors Phase 14
//    Superseded amber idiom — visual idiom consistency, Open Decision 8 wrapper pattern)
//  - Depth radio group (1/2/3 hops — Open Decision 2: three radio buttons preferred over
//    slider for 3-value UX)
//  - "Show all" toggle (reveals Inferred-confidence rows — Open Decision 3: webview-side
//    visibility filter; kernel returns all rows regardless)
//
// Open Decision 8: wrapper component preferred over a `variant` prop on ComplianceReportView
// (keeps ComplianceReportView prop surface clean; this component is the single consumer).
//
// Pitfall 1 fence (webview-side): no Date.now() / new Date() calls in this file.
// asOf threading is host-only (panel.ts handleMessage, Plan 16-03 Task 1).

import * as React from 'react';
import type { ComplianceReportForCanvas, ComplianceRowForCanvas } from '../messages.js';
import { ComplianceReportView } from './ComplianceReport.js';

export interface HypotheticalImpactProps {
	readonly report: ComplianceReportForCanvas | null;
	readonly depth?: 1 | 2 | 3;
	readonly onDepthChange?: (depth: 1 | 2 | 3) => void;
	readonly showAll?: boolean;
	readonly onShowAllChange?: (showAll: boolean) => void;
}

/**
 * Hypothetical Impact section — wraps ComplianceReportView with Phase 16 DEEP-03 controls.
 * Returns null when report is null (Wave-0 stub behavior preserved for empty-payload case).
 */
export function HypotheticalImpact(props: HypotheticalImpactProps): React.ReactElement | null {
	if (props.report === null) {
		return null;
	}
	const depth = props.depth ?? 3;
	const showAll = props.showAll ?? false;

	// Open Decision 3: confidence_threshold filter is webview-side visibility hint.
	// The kernel returns all rows; this toggle controls which rows are shown.
	// confidence_band is present on ConstraintLiftRow (Phase 16 Plan 16-02 Task 2) but not
	// declared on ComplianceRowForCanvas (the schema predates DEEP-03). Cast defensively.
	const filterRow = (r: ComplianceRowForCanvas): boolean => {
		const band = (r as unknown as { confidence_band?: string }).confidence_band;
		if (band === 'inferred' && !showAll) {
			return false;
		}
		return true;
	};

	const filtered: ComplianceReportForCanvas = {
		...props.report,
		definitely_affected: props.report.definitely_affected.filter(filterRow),
		potentially_affected: props.report.potentially_affected.filter(filterRow),
	};

	return (
		<section className="hypothetical-impact-section" data-testid="hypothetical-impact-section">
			<span className="hypothetical-impact-badge" data-testid="hypothetical-impact-badge">
				Hypothetical
			</span>
			<div className="hypothetical-impact-controls">
				<fieldset>
					<legend>Depth</legend>
					{([1, 2, 3] as const).map((d) => (
						<label key={d}>
							<input
								type="radio"
								name="hypothetical-impact-depth"
								value={d}
								checked={depth === d}
								onChange={() => props.onDepthChange?.(d)}
							/>
							{d}
						</label>
					))}
				</fieldset>
				<label>
					<input
						type="checkbox"
						checked={showAll}
						onChange={(e) => props.onShowAllChange?.(e.target.checked)}
						data-testid="hypothetical-impact-show-all-toggle"
					/>
					Show all (include Inferred-confidence rows)
				</label>
			</div>
			<ComplianceReportView report={filtered} />
		</section>
	);
}
