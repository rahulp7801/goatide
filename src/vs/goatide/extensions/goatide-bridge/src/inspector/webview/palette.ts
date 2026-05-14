/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/inspector/webview/palette.ts —
// Phase 15 Plan 15-04 (Wave 3 — DEEP-02 Graphify dark palette + Cytoscape stylesheet).
//
// Per-kind colors use the CANONICAL 5 kernel kinds defined in
// kernel/src/graph/schema/nodes.ts:17 — ConstraintNode / DecisionNode / ContractNode
// / OpenQuestion / Attempt. RESEARCH Risk 1 documents that the ROADMAP narrative
// names three additional kinds which DO NOT exist in the kernel; the inspector
// uses the canonical 5 only. "Superseded" is rendered as a visual modifier on any
// node with `invalidated_at !== null` (Cytoscape attribute-existence selector
// `node[invalidated_at]`), NOT as its own kind.
//
// Bundle-size note (RESEARCH Risk 6): cytoscape@^3.33 ~120KB minified +
// cytoscape-fcose@^2.2 ~30KB minified are bundled into dist/inspector/index.js by
// esbuild's IIFE bundle. React is shared with the canvas bundle's React (~45KB but
// already paid).

// `Stylesheet` type alias lives inside the cytoscape namespace declaration. With
// `export = cytoscape` (CommonJS-style) + Node16 module resolution + `esModuleInterop`,
// the cleanest access for type-only namespace consumers is the union of the two
// concrete shapes (StylesheetStyle | StylesheetCSS). This avoids the
// `import type cytoscape from 'cytoscape'` pattern which only exposes the default
// callable signature, not the namespace types. Graph.tsx is the sole value-importer.
import type { StylesheetStyle, StylesheetCSS } from 'cytoscape';
type Stylesheet = StylesheetStyle | StylesheetCSS;

/**
 * Canonical Graphify-dark color palette. Hex values are slate-/blue-/red-/amber-/
 * violet-/emerald-family Tailwind v3 tokens; reproducible without a CSS framework
 * dependency. Slate-900 (#0f172a) background is locked by ROADMAP Phase 15 SC#1.
 */
export const PALETTE = {
	bg: '#0f172a',                            // slate-900 — ROADMAP SC#1 locked
	decisionNode: '#60a5fa',                  // blue-400
	constraintNode: '#f87171',                // red-400
	contractNode: '#fbbf24',                  // amber-400
	openQuestion: '#a78bfa',                  // violet-400
	attempt: '#6ee7b7',                       // emerald-300
	edgeDefault: '#475569',                   // slate-600
	edgeSupersedes: '#94a3b8',                // slate-400 dashed
	nodeSelectedRing: '#facc15',              // yellow-400
	nodeLabel: '#e2e8f0',                     // slate-200
	nodeBorderInvalidated: '#94a3b8',         // slate-400 dashed for superseded
} as const;

/**
 * Cytoscape stylesheet for the Graph Inspector. Each entry pairs a selector with
 * an inline style object. The 5 per-kind selectors override the base node style;
 * the `node[invalidated_at]` selector adds a desaturated dashed-border modifier
 * for any kind whose `data.invalidated_at` is a non-null value (Cytoscape
 * bracket-attribute existence syntax). `edge[kind="supersedes"]` paints supersedes
 * edges in a lighter dashed line.
 */
export const GRAPHIFY_STYLE: Stylesheet[] = [
	{
		selector: 'node',
		style: {
			'background-color': PALETTE.edgeDefault,
			'label': 'data(label)',
			'color': PALETTE.nodeLabel,
			'font-size': 11,
			'text-valign': 'bottom',
			'text-margin-y': 6,
		},
	},
	{ selector: 'node[kind="DecisionNode"]', style: { 'background-color': PALETTE.decisionNode } },
	{ selector: 'node[kind="ConstraintNode"]', style: { 'background-color': PALETTE.constraintNode } },
	{ selector: 'node[kind="ContractNode"]', style: { 'background-color': PALETTE.contractNode } },
	{ selector: 'node[kind="OpenQuestion"]', style: { 'background-color': PALETTE.openQuestion } },
	{ selector: 'node[kind="Attempt"]', style: { 'background-color': PALETTE.attempt } },
	{
		selector: 'node[invalidated_at]',
		style: {
			'opacity': 0.55,
			'border-style': 'dashed',
			'border-width': 1,
			'border-color': PALETTE.nodeBorderInvalidated,
		},
	},
	{
		selector: 'node:selected',
		style: {
			'border-color': PALETTE.nodeSelectedRing,
			'border-width': 3,
		},
	},
	{
		selector: 'edge',
		style: {
			'width': 1,
			'line-color': PALETTE.edgeDefault,
			'curve-style': 'haystack',
			'target-arrow-color': PALETTE.edgeDefault,
			'target-arrow-shape': 'triangle',
			'arrow-scale': 0.8,
		},
	},
	{
		selector: 'edge[kind="supersedes"]',
		style: {
			'line-color': PALETTE.edgeSupersedes,
			'line-style': 'dashed',
		},
	},
];
