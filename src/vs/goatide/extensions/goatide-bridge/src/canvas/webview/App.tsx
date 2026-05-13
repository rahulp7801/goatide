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
import { useEffect, useState, useCallback, useRef } from 'react';
import type { WebviewRpc } from '../rpc.js';
import type { CanvasShowPayload } from '../messages.js';
import { DiffPane as DefaultDiffPane, type DiffPaneProps } from './DiffPane.js';
import { CitationList } from './CitationList.js';
import { ConfirmationPhrase } from './ConfirmationPhrase.js';
import { DriftFindings } from './DriftFindings.js';
import { ComplianceReportView } from './ComplianceReport.js';

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
			</header>
			<div className="goatide-canvas-body">
				{/* Phase 7 Plan 07-07 — DriftFindings rendered above diff pane when present. */}
				{payload.drift_findings && payload.drift_findings.length > 0 ? (
					<DriftFindings findings={payload.drift_findings} rpc={rpc} />
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
				<section className="goatide-canvas-citations">
					<CitationList citations={payload.citations} onExplain={onCitationExplain} />
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
