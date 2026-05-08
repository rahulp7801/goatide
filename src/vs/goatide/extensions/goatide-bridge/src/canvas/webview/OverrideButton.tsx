/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/canvas/webview/OverrideButton.tsx — Phase 7 Plan 07-07 (DRIFT-06 audit-trail UI).
//
// Override button + free-form note textarea that fires record_override when a contract
// lock has been raised. The submit button is disabled until the note has at least one
// non-whitespace character (CANV-03 precedent inherited from RejectWithNote, doubled at
// the kernel server.ts boundary so empty notes are rejected even if the bridge UI is
// circumvented).
//
// Posts a 'record_override' webview message on submit. tier-dispatch.ts owns the kernel
// RPC call (Option A: save-gate-owned override path); panel.ts forwards the message into
// tier-dispatch's registered callback. The callback's outcome is posted back as
// 'record_override.response' which we listen for here to display success / error feedback.
//
// Rendered inside the ComplianceReport's footer when a lock_trigger is non-null in the
// CanvasShowPayload. Pitfall-9 shame-loop defense: zero status-bar surface — the override
// frequency lives in `goatide-cli harvest metrics` (Plan 07-06 + Plan 07-07 deliberate).

import * as React from 'react';
import { useCallback, useEffect, useState } from 'react';
import type { WebviewRpc } from '../rpc.js';
import type { LockTriggerForCanvas } from '../messages.js';

export interface OverrideButtonProps {
	rpc: WebviewRpc;
	changeId: string;
	lockTrigger: LockTriggerForCanvas;
	onSuccess?: (attemptId: string) => void;
}

export function OverrideButton({ rpc, changeId, lockTrigger, onSuccess }: OverrideButtonProps): React.ReactElement {
	const [note, setNote] = useState('');
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const trimmedLength = note.trim().length;
	const disabled = trimmedLength < 1 || submitting;

	useEffect(() => {
		const handler = (event: MessageEvent): void => {
			const data = event.data as { type?: string; payload?: { ok?: boolean; attempt_node_id?: string; error?: string } };
			if (data?.type !== 'record_override.response') {
				return;
			}
			setSubmitting(false);
			if (data.payload?.ok) {
				setError(null);
				if (data.payload.attempt_node_id !== undefined) {
					onSuccess?.(data.payload.attempt_node_id);
				}
			} else {
				setError(data.payload?.error ?? 'override failed');
			}
		};
		window.addEventListener('message', handler);
		return () => window.removeEventListener('message', handler);
	}, [onSuccess]);

	const onSubmit = useCallback(() => {
		if (disabled) {
			return;
		}
		setSubmitting(true);
		setError(null);
		// recordContractOverride contract: this submit kicks off the audit-trail RPC via
		// panel.ts → tier-dispatch.ts (Option A: save-gate-owned override path). The note
		// must be >=1 char which is double-enforced server-side by graph.recordContractOverride.
		rpc.postRecordOverride({
			change_id: changeId,
			contract_node_id: lockTrigger.contract_node_id,
			section_name: lockTrigger.section_name,
			note: note.trim(),
		});
	}, [disabled, rpc, changeId, lockTrigger.contract_node_id, lockTrigger.section_name, note]);

	return (
		<div className="override-button-container" data-testid="override-button-container">
			<label className="override-textarea-label" htmlFor="override-note">
				Override Reason (required)
			</label>
			<textarea
				id="override-note"
				className="override-textarea"
				rows={3}
				value={note}
				onChange={(e) => setNote(e.target.value)}
				placeholder="Describe why you are overriding the contract lock. This will be persisted as an Attempt(contract_override) for audit."
				data-testid="override-note-input"
			/>
			<div className="override-button-row">
				<button
					className="override-button"
					onClick={onSubmit}
					disabled={disabled}
					data-testid="override-submit"
				>
					{submitting ? 'Recording…' : 'Override with Reason'}
				</button>
				{error !== null ? (
					<span className="override-error" data-testid="override-error">{error}</span>
				) : null}
			</div>
		</div>
	);
}

export default OverrideButton;
