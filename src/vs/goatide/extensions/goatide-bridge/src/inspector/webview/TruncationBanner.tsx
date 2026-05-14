/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/inspector/webview/TruncationBanner.tsx —
// Phase 15 Plan 15-04 (Wave 3 — DEEP-02 truncation indicator).
//
// Renders the host-reported truncation banner when an inspector.show payload carries
// `truncated: true`. RESEARCH Open Decision 8 locks the copy literal to "Showing first N
// nodes (truncated)"; the Wave-0 RED test inspector-truncation-banner.test.tsx queries
// the `data-testid="inspector-truncation-banner"` element and asserts the textContent
// includes "Showing first".
//
// The count parameter is the displayed node count — equal to the kernel handler's
// max_nodes cap (default 2000 per Plan 15-02 server.ts QueryGraphSnapshotRequest handler).

import * as React from 'react';

export interface TruncationBannerProps {
	readonly count: number;
}

/**
 * Banner rendered above the Cytoscape canvas when the host reports `truncated: true`.
 * Uses the canonical literal copy locked by RESEARCH Open Decision 8.
 */
export function TruncationBanner({ count }: TruncationBannerProps): React.ReactElement {
	return (
		<div data-testid="inspector-truncation-banner" className="inspector-truncation-banner">
			Showing first {count} nodes (truncated)
		</div>
	);
}
