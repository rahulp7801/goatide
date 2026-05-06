/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Wave-0 stub for CANV-01 + CANV-02 — webview React UI rendering.
// Plan 04-03 implements DiffPane (Monaco) + CitationList + Accept/Reject buttons.
// Plan 04-03 also wires jsdom + @testing-library/react in beforeEach for these tests.

import { describe, it } from 'mocha';

describe('CANV-01 + CANV-02 — Canvas React UI', () => {
	it.skip('renders diff pane + citation list + 3 buttons — Plan 04-03 has not yet implemented Canvas React UI', () => {
		// Stub. Plan 04-03 fills this in (uses @testing-library/react + jsdom).
	});
	it.skip('citation list renders edge-path breadcrumbs — Plan 04-03 has not yet implemented CitationList', () => {
		// Stub. Plan 04-03.
	});
	it.skip('Reject-with-Note opens text-area requiring >=1 char — Plan 04-03 has not yet implemented RejectWithNote', () => {
		// Stub. Plan 04-03.
	});
	it.skip('confirmation phrase modal disables Accept until exact phrase typed — Plan 04-03 has not yet implemented ConfirmationPhrase', () => {
		// Stub. Plan 04-03 (CANV-08).
	});
});
