/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Bridge → kernel/dist/canvas dynamic-import helper — Plan 04-06.
//
// Bridge is CJS; kernel/dist is ESM. Static imports across the boundary fail under TS 5.6
// Node16 moduleResolution (TS1479 / TS1541). We use a dynamic import at runtime + locally
// redeclared types (drift caught by Plan 04-02's attempt-payload.spec).
//
// This helper was extracted from tier-dispatch.ts in Plan 04-06 so on-will-save.ts can
// reuse it for the kernel-degraded destructive-block check (CANV-10) without duplicating
// the dynamic-import + cache logic.

export type CanvasTier = 'silent' | 'inline' | 'modal';

export interface CitationDetail {
	node_id: string;
	kind: 'ConstraintNode' | 'DecisionNode' | 'ContractNode' | 'OpenQuestion' | 'Attempt';
	contract_path?: string;
}

export interface TierClassifierInputs {
	receipt: import('../kernel/methods.js').ReasoningReceipt;
	diff: string;
	anchorPath?: string;
	contractAllowlist?: readonly string[];
	citationDetails?: readonly CitationDetail[];
}

export interface CanvasModule {
	classifyTier: (inputs: TierClassifierInputs) => CanvasTier;
	detectDestructive: (diff: string, anchorPath?: string) => boolean;
	destructiveVerbForConfirmation: (diff: string) => string;
	DEFAULT_HIGH_IMPACT_CONTRACT_PREFIXES: readonly string[];
}

let cachedCanvasModule: CanvasModule | undefined;

export async function getCanvasModule(): Promise<CanvasModule> {
	if (cachedCanvasModule) {
		return cachedCanvasModule;
	}
	// Dynamic import bridges CJS bridge to ESM kernel/dist. Path resolved at runtime.
	const mod = await import('../../../../../../../kernel/dist/canvas/index.js');
	cachedCanvasModule = mod as unknown as CanvasModule;
	return cachedCanvasModule;
}
