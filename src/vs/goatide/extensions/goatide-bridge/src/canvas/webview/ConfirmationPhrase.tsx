/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/canvas/webview/ConfirmationPhrase.tsx - Phase 4 (Plan 04-03) destructive confirmation modal.
//
// CANV-08: developer types the destructive verb to enable the Accept button.
// Pitfall 6: paste-bypassable accepted as friction-not-security tradeoff (RESEARCH).

import * as React from 'react';
import { useState } from 'react';

export interface ConfirmationPhraseProps {
	expectedPhrase: string;
	onConfirm: () => void;
	confirmed: boolean;
}

export function ConfirmationPhrase({ expectedPhrase, onConfirm, confirmed }: ConfirmationPhraseProps): React.ReactElement {
	const [typed, setTyped] = useState('');
	const matches = typed === expectedPhrase;

	return (
		<div className="goatide-confirm-phrase" data-testid="confirmation-phrase">
			<label htmlFor="goatide-confirm-input">
				Type <code>{expectedPhrase}</code> to enable Accept on this destructive change.
			</label>
			<input
				id="goatide-confirm-input"
				type="text"
				value={typed}
				onChange={(e) => setTyped(e.target.value)}
				disabled={confirmed}
				data-testid="confirmation-phrase-input"
				aria-label="confirmation-phrase-input"
			/>
			<button
				type="button"
				onClick={onConfirm}
				disabled={!matches || confirmed}
				data-testid="confirmation-phrase-button"
			>
				{confirmed ? 'Confirmed' : 'Confirm'}
			</button>
		</div>
	);
}
