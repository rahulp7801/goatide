/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/canvas/webview/CitationList.tsx - Phase 4 (Plan 04-03) citations + edge-path breadcrumbs.
//
// REC-04: Inferred and Explicit citations rendered in SEPARATE sections.
// REC-03: 'superseded by' badge when successor_id is non-null.
// CANV-02: edge-path breadcrumbs.
//
// Phase 7 Plan 07-05 (DRIFT-02): intent_drift_badge rendered next to citation rows for
// DecisionNodes whose derived_under_priority mismatches the active session priority.
// Phase 14 Plan 14-03 (DEEP-04): the badge is now a discriminated union — two variants:
//   - 'priority-mismatch': existing amber-on-amber pill (label "IntentDrift").
//   - 'historical-conflict': new amber-on-amber pill (label "Superseded <date>"). Mandate D
//     — informs only; save still proceeds. Click target is the citation's "Why?" button
//     which surfaces the explanation in the modal.

import * as React from 'react';
import type { RenderedCitationForCanvas } from '../messages.js';

export interface CitationListProps {
	citations: ReadonlyArray<RenderedCitationForCanvas>;
	onExplain: (node_id: string) => void;
}

/**
 * Format a Phase-14 supersession ISO timestamp for the historical-conflict badge label.
 * Falls back to the raw input on Intl/Date failures so the badge always renders something.
 */
function formatSupersededDate(supersededAt: string): string {
	try {
		const d = new Date(supersededAt);
		if (Number.isNaN(d.getTime())) {
			return supersededAt;
		}
		return new Intl.DateTimeFormat(undefined, { dateStyle: 'short' }).format(d);
	} catch {
		return supersededAt;
	}
}

export function CitationList({ citations, onExplain }: CitationListProps): React.ReactElement {
	const explicit = citations.filter((c) => c.confidence === 'Explicit');
	const inferred = citations.filter((c) => c.confidence === 'Inferred');

	return (
		<div className="goatide-citation-list">
			<CitationSection title="Explicit citations" citations={explicit} onExplain={onExplain} variant="explicit" />
			<CitationSection title="Inferred citations" citations={inferred} onExplain={onExplain} variant="inferred" />
			{citations.length === 0 ? (
				<div className="goatide-citation-empty">No citations - proposed change has no graph anchor.</div>
			) : null}
		</div>
	);
}

interface CitationSectionProps {
	title: string;
	citations: ReadonlyArray<RenderedCitationForCanvas>;
	onExplain: (node_id: string) => void;
	variant: 'explicit' | 'inferred';
}

function CitationSection({ title, citations, onExplain, variant }: CitationSectionProps): React.ReactElement | null {
	if (citations.length === 0) {
		return null;
	}
	return (
		<section className={`goatide-citation-section goatide-citation-${variant}`} data-testid={`citation-section-${variant}`}>
			<h3 className="goatide-citation-title">{title}</h3>
			<ul className="goatide-citation-rows">
				{citations.map((c) => (
					<li key={c.node_id} className="goatide-citation-row" data-testid="citation-row">
						<span className="goatide-citation-breadcrumb">{c.edge_path}</span>
						<span className="goatide-citation-snippet">{c.body_preview}</span>
						<span className="goatide-citation-id" title={c.node_id}>{c.node_id.slice(-6)}</span>
						{c.successor_id ? (
							<span className="goatide-citation-superseded" title={`superseded by ${c.successor_id}`}>
								superseded by
							</span>
						) : null}
						{c.intent_drift_badge?.kind === 'priority-mismatch' ? (
							<span
								className="intent-drift-badge"
								title={c.intent_drift_badge.explanation}
								data-testid="intent-drift-badge"
							>
								IntentDrift
							</span>
						) : null}
						{c.intent_drift_badge?.kind === 'historical-conflict' ? (
							<span
								className="intent-drift-badge intent-drift-badge--historical-conflict"
								title={c.intent_drift_badge.explanation}
								data-testid="intent-drift-badge-historical-conflict"
							>
								{`Superseded ${formatSupersededDate(c.intent_drift_badge.superseded_at)}`}
							</span>
						) : null}
						<button
							className="goatide-citation-explain"
							onClick={() => onExplain(c.node_id)}
							data-testid="citation-explain"
						>
							Why?
						</button>
					</li>
				))}
			</ul>
		</section>
	);
}
