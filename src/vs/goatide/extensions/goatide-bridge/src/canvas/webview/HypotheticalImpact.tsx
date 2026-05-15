/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 16 Plan 16-04 DEEP-03 — Wave-0 stub. Real body lands Wave 3.
//
// Wraps the existing ComplianceReport.tsx with a "Hypothetical" badge + depth radio
// (1/2/3 hops) + "show all" toggle for Inferred-confidence rows. Plan 16-04 fills.

import * as React from 'react';
import type { ComplianceReportForCanvas } from '../messages.js';

export interface HypotheticalImpactProps {
	readonly report: ComplianceReportForCanvas | null;
	// Wave 3 adds: depth, onDepthChange, showAll, onShowAllChange, onClose
}

/**
 * Wave-0 stub — returns null. Wave 3 (Plan 16-04) implements the full render:
 * ComplianceReport.tsx wrapper + "Hypothetical" badge + depth radio + show-all toggle.
 */
export function HypotheticalImpact(_props: HypotheticalImpactProps): React.ReactElement | null {
	// Wave-0 stub — Wave 3 (Plan 16-04) implements the full render body.
	return null;
}
