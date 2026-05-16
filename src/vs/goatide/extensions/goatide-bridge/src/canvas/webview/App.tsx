/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/canvas/webview/App.tsx - Phase 4 (Plan 04-03) Canvas top-level component.
//
// Receives canvas.show payloads via WebviewRpc; renders DiffPane + CitationList + 3 buttons
// + ConfirmationPhrase (when destructive). Uses key={payload.change_id} on the inner shell
// to force remount per save (Pitfall 8 - stale React state).

import * as React from 'react';
import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { WebviewRpc } from '../rpc.js';
import type { CanvasShowPayload } from '../messages.js';
import { DiffPane as DefaultDiffPane, type DiffPaneProps } from './DiffPane.js';
import { CitationList } from './CitationList.js';
import { ConfirmationPhrase } from './ConfirmationPhrase.js';
import { DriftFindings, type DriftFindingsCitation } from './DriftFindings.js';
import { ComplianceReportView } from './ComplianceReport.js';
import { RationaleChain } from './RationaleChain.js';
import { HypotheticalImpact } from './HypotheticalImpact.js';
import { rerankBySessionPriority } from '../../inspector/session-priority-lens.js';

export interface AppProps {
	rpc: WebviewRpc;
	/** Optional override for tests - Monaco doesn't render under jsdom. */
	DiffComponent?: React.ComponentType<DiffPaneProps>;
}

export function App({ rpc, DiffComponent }: AppProps): React.ReactElement | null {
	const [payload, setPayload] = useState<CanvasShowPayload | null>(null);
	const [degraded, setDegraded] = useState<string | null>(null);
	const showStartMsRef = useRef<number>(0);

	useEffect(() => {
		// Signal the extension host that the webview is ready to receive canvas.show.
		// This handshake prevents the message from being dropped when the panel is
		// freshly created (Panel B in multi-wave ceremonies) and rpc.show() fires before
		// React's message subscriber is established. The host waits for canvas.ready
		// before sending canvas.show (see panel.ts showAndAwait).
		rpc.postReady();
		const unsubscribe = rpc.subscribe((msg) => {
			if (msg.type === 'canvas.show') {
				setPayload(msg.payload);
				showStartMsRef.current = Date.now();
				setDegraded(null);
			} else if (msg.type === 'canvas.hide') {
				setPayload(null);
			} else if (msg.type === 'kernel.degraded') {
				setDegraded(msg.payload.reason);
			}
		});
		return unsubscribe;
	}, [rpc]);

	if (!payload) {
		return degraded
			? <div className="goatide-degraded-banner" role="alert">Kernel degraded: {degraded}</div>
			: null;
	}

	// CANV-04/05: silent tier never shows the panel; the bridge filters silent BEFORE posting.
	// Defensive: if a silent payload sneaks through, render nothing.
	if (payload.tier === 'silent') {
		return null;
	}

	return <CanvasShell key={payload.change_id} rpc={rpc} payload={payload} DiffComponent={DiffComponent} startMs={showStartMsRef.current} />;
}

interface CanvasShellProps {
	rpc: WebviewRpc;
	payload: CanvasShowPayload;
	DiffComponent?: React.ComponentType<DiffPaneProps>;
	startMs: number;
}

function CanvasShell({ rpc, payload, DiffComponent, startMs }: CanvasShellProps): React.ReactElement {
	const Diff = DiffComponent ?? DefaultDiffPane;
	const [showRejectInput, setShowRejectInput] = useState(false);
	const [rejectNote, setRejectNote] = useState('');
	const [confirmedDestructive, setConfirmedDestructive] = useState(!payload.destructive);

	// Phase 16 Plan 16-04 (DEEP-03) — local state for HypotheticalImpact controls.
	// Depth and showAll are render-time concerns (no kernel touch, no graph mutation).
	const [hypotheticalDepth, setHypotheticalDepth] = useState<1 | 2 | 3>(3);
	const [hypotheticalShowAll, setHypotheticalShowAll] = useState<boolean>(false);

	const onAccept = useCallback(() => {
		const latencyMs = Date.now() - startMs;
		rpc.postAccept(payload.change_id, latencyMs);
	}, [rpc, payload.change_id, startMs]);

	const onReject = useCallback(() => {
		rpc.postReject(payload.change_id);
	}, [rpc, payload.change_id]);

	const onRejectWithNote = useCallback(() => {
		if (rejectNote.trim().length === 0) {
			return;
		}
		rpc.postRejectWithNote(payload.change_id, rejectNote.trim());
	}, [rpc, payload.change_id, rejectNote]);

	const onCitationExplain = useCallback((node_id: string) => {
		rpc.postCitationExplain(node_id);
	}, [rpc]);

	// Phase 14 Plan 14-02 (DEEP-01): "Why does this exist?" button click sends a payload-less
	// canvas.requestRationale message; panel.ts handleMessage extracts the citation seed +
	// the receipt's graph_snapshot_tx_time from its stored lastPayload, calls
	// kernel.queryRationaleAt, and re-posts canvas.show with rationale_chain populated. No
	// client-side timestamping (Pitfall 1 fence).
	const onRationaleRequest = useCallback(() => {
		rpc.postRationaleRequest();
	}, [rpc]);

	const rationaleChain = payload.rationale_chain ?? null;
	const rationaleError = payload.rationale_error ?? null;

	// Phase 14 Plan 14-04 (DEEP-05) — rerank citations in-memory by drift-bearing badge.
	// Pure render-time concern: NO kernel touch, NO graph mutation (Mandate B). The lens
	// returns a NEW citations array (input not mutated) and an indicator string. Wrapped in
	// useMemo keyed on the citations identity + sessionPriority so the sort runs once per
	// canvas.show payload, not on every CanvasShell re-render.
	const sessionPriority = payload.session_priority ?? null;
	const sessionPriorityIndicator = payload.session_priority_indicator ?? null;
	const rerankedCitations = useMemo(() => {
		if (sessionPriority === null) {
			return payload.citations;
		}
		return rerankBySessionPriority({
			citations: payload.citations,
			findings: payload.drift_findings ?? [],
			sessionPriority,
		}).citations;
	}, [payload.citations, payload.drift_findings, sessionPriority]);

	// Phase 16 Plan 16-04 (DEEP-03) — build DriftFindingsCitation[] for DriftFindings.
	// When constraint_lift_eligible is true, the host has already verified (via citationDetails
	// hydration in tier-dispatch.ts) that at least one cited node is a ConstraintNode.
	// We annotate the first citation as a ConstraintNode so DriftFindings' webview-side
	// defensive check finds it (the check guards against cited_payload.kind; RenderedCitation
	// from CanvasShowPayload lacks cited_payload). Subsequent citations are passed as-is.
	const constraintLiftEligible = payload.constraint_lift_eligible ?? false;
	const driftFindingsCitations = useMemo((): DriftFindingsCitation[] => {
		if (!constraintLiftEligible || rerankedCitations.length === 0) {
			return rerankedCitations.map((c) => ({ node_id: c.node_id }));
		}
		// Mark the first citation as the picked ConstraintNode (host-verified). Remaining
		// citations pass through without a cited_payload annotation.
		return rerankedCitations.map((c, idx) => idx === 0
			? { cited_payload: { kind: 'ConstraintNode', node_id: c.node_id }, node_id: c.node_id }
			: { node_id: c.node_id }
		);
	}, [constraintLiftEligible, rerankedCitations]);

	// Phase 16 Plan 16-04 (DEEP-03) — depth change handler for HypotheticalImpact.
	// When depth changes, re-fire canvas.requestConstraintLift with the new max_hops.
	// asOf is host-only (Pitfall 1 fence — NEVER Date.now() or new Date() here).
	const onHypotheticalDepthChange = useCallback((d: 1 | 2 | 3) => {
		setHypotheticalDepth(d);
		const constraintCitation = driftFindingsCitations.find(
			(c) => c.cited_payload?.kind === 'ConstraintNode',
		);
		if (constraintCitation) {
			const nodeId = constraintCitation.cited_payload?.node_id ?? constraintCitation.node_id;
			if (nodeId) {
				rpc.postConstraintLiftRequest({
					constraint_node_id: nodeId,
					max_hops: d,
					confidence_threshold: 0.5,
				});
			}
		}
	}, [rpc, driftFindingsCitations]);

	const friendlyFile = formatFileUri(payload.file_uri);

	return (
		<div className={`goatide-canvas goatide-canvas-${payload.tier}${payload.destructive ? ' goatide-canvas-destructive' : ''}`}>
			<header className="goatide-canvas-header">
				<span className="goatide-canvas-title">Verification Canvas</span>
				<span className={`goatide-canvas-tier-badge ${payload.tier}`}>{payload.tier}</span>
				<span className="goatide-canvas-file" title={payload.file_uri}>{friendlyFile}</span>
				{payload.destructive ? (
					<span className="goatide-canvas-destructive-flag">Destructive</span>
				) : null}
				{/* Phase 14 Plan 14-04 (DEEP-05) — header indicator. Renders ONLY when the host populated session_priority_indicator. The text content matches the host-built string verbatim — never re-constructed client-side. */}
				{sessionPriorityIndicator !== null ? (
					<span
						className="canvas-header__session-priority"
						data-testid="canvas-header-session-priority"
					>
						{sessionPriorityIndicator}
					</span>
				) : null}
			</header>
			<div className="goatide-canvas-body">
				{/* Phase 7 Plan 07-07 — DriftFindings rendered above diff pane when present. Phase 16 Plan 16-04 (DEEP-03) — threads constraintLiftEligible + citations. */}
				{payload.drift_findings && payload.drift_findings.length > 0 ? (
					<DriftFindings
						findings={payload.drift_findings}
						rpc={rpc}
						constraintLiftEligible={constraintLiftEligible}
						citations={driftFindingsCitations}
					/>
				) : null}
				{/* Phase 7 Plan 07-07 — ComplianceReport above diff pane when lock_trigger fires. */}
				{payload.lock_trigger ? (
					<ComplianceReportView
						report={payload.compliance_report ?? null}
						overrideProps={{
							rpc,
							changeId: payload.change_id,
							lockTrigger: payload.lock_trigger,
						}}
					/>
				) : null}
				<section className="goatide-canvas-diff">
					<Diff
						original={payload.original_content}
						modified={payload.modified_content}
						language={payload.language}
					/>
				</section>
				{/* Phase 14 Plan 14-02 (DEEP-01) — RationaleChain slots between DiffPane and CitationList per the Phase 14 mandate (no new panel). The component renders the request button when idle, the chain when loaded, or a degraded message when the kernel is offline. */}
				<RationaleChain
					chain={rationaleChain}
					error={rationaleError}
					onRequest={onRationaleRequest}
				/>
				{/* Phase 16 Plan 16-04 (DEEP-03) — HypotheticalImpact section. Mirrors Phase 14 RationaleChain.tsx four-branch rendering pattern. Rendered after DiffPane + RationaleChain; before CitationList. */}
				{payload.hypothetical_impact_error === 'kernel-degraded' ? (
					<div
						className="hypothetical-impact-kernel-degraded goatide-degraded-banner"
						data-testid="hypothetical-impact-kernel-degraded"
					>
						Kernel is offline — hypothetical impact unavailable.
					</div>
				) : null}
				{payload.hypothetical_impact ? (
					<HypotheticalImpact
						report={payload.hypothetical_impact}
						depth={hypotheticalDepth}
						onDepthChange={onHypotheticalDepthChange}
						showAll={hypotheticalShowAll}
						onShowAllChange={setHypotheticalShowAll}
					/>
				) : null}
				<section className="goatide-canvas-citations">
					<CitationList
						citations={rerankedCitations}
						onExplain={onCitationExplain}
						onAddDecisionNode={() => rpc.postAddDecisionNode()}
					/>
				</section>
			</div>
			{payload.destructive && payload.confirmation_phrase ? (
				<section className="goatide-canvas-confirm">
					<ConfirmationPhrase
						expectedPhrase={payload.confirmation_phrase}
						onConfirm={() => setConfirmedDestructive(true)}
						confirmed={confirmedDestructive}
					/>
				</section>
			) : null}
			<footer className="goatide-canvas-actions">
				<button
					className="goatide-canvas-accept"
					onClick={onAccept}
					disabled={!confirmedDestructive}
					data-testid="canvas-accept"
				>
					Accept
				</button>
				<button
					className="goatide-canvas-reject"
					onClick={onReject}
					data-testid="canvas-reject"
				>
					Reject
				</button>
				<button
					className="goatide-canvas-reject-note"
					onClick={() => setShowRejectInput(true)}
					data-testid="canvas-reject-with-note-toggle"
				>
					Reject with Note
				</button>
				{showRejectInput ? (
					<div className="goatide-canvas-reject-form">
						<textarea
							value={rejectNote}
							onChange={(e) => setRejectNote(e.target.value)}
							placeholder="Why are you rejecting? (creates an OpenQuestion node)"
							rows={3}
							data-testid="canvas-reject-note-input"
						/>
						<button
							onClick={onRejectWithNote}
							disabled={rejectNote.trim().length === 0}
							data-testid="canvas-reject-with-note-submit"
						>
							Submit Rejection
						</button>
					</div>
				) : null}
			</footer>
		</div>
	);
}

function formatFileUri(uri: string): string {
	try {
		const decoded = decodeURIComponent(uri);
		const withoutScheme = decoded.replace(/^file:\/+/, '');
		const normalised = withoutScheme.replace(/\\/g, '/');
		const trimmed = normalised.startsWith('/') && /^\/[a-zA-Z]:/.test(normalised)
			? normalised.slice(1)
			: normalised;
		return trimmed;
	} catch {
		return uri;
	}
}
