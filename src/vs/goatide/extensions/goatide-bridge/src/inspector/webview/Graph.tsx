/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/inspector/webview/Graph.tsx —
// Phase 15 Plan 15-04 (Wave 3 — DEEP-02 Cytoscape mount + layout management).
//
// Mounts a Cytoscape instance into a <div ref>; runs `fcose` layout on first
// snapshot, `preset` (with persisted positions from vscode.setState) on subsequent
// snapshots. Performance settings per RESEARCH Performance Research table —
// hideEdgesOnViewport + textureOnViewport + pixelRatio:1 + motionBlur:false +
// wheelSensitivity:0.2 — meet the SC#3 < 2s 500-node budget.
//
// Cross-mount persistence (RESEARCH Risk 5 — Issue #5 from gsd-plan-checker):
// `retainContextWhenHidden:false` on the host panel tears down the webview on hide.
// On re-show, a new component instance must read persisted positions from
// `vscodeApi.getState()` (which survives webview teardown) and run `preset`, NOT
// re-run `fcose` (which would overwrite the persisted positions). The
// `isFirstRunRef = useRef(vscodeApi.getState()?.nodePositions === undefined)`
// seeding handles this — first-run iff there are no persisted positions yet.
//
// Mandate B fence: this file imports ZERO write-RPC tokens; the projection
// utilities kernelRowToCyElement + edgeRowToCyElement preserve mutation invariants
// (Pitfall 1 — input rows never mutated by Cytoscape).

import * as React from 'react';
import { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
// cytoscape-fcose has no @types package; declare the module so `import fcose`
// resolves under tsc. The runtime export is a single registrar function expected
// by `cytoscape.use(fcose)`.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — see comment above for the type-only declaration rationale.
import fcose from 'cytoscape-fcose';
import { GRAPHIFY_STYLE } from './palette.js';
import { kernelRowToCyElement, type InspectorNodeRow } from '../kernelRowToCyElement.js';
import { edgeRowToCyElement, type InspectorEdgeRow } from '../edgeRowToCyElement.js';
import { vscodeApi } from './vscode-api.js';

// Register the fcose layout extension exactly once per webview load. Multiple
// registrations are a Cytoscape warning, not an error, but it's cleaner here.
cytoscape.use(fcose as cytoscape.Ext);

export interface GraphProps {
	snapshot: { nodes: InspectorNodeRow[]; edges: InspectorEdgeRow[] };
	onSelectNode?: (nodeId: string) => void;
}

/**
 * Cytoscape-rendered graph. The container <div ref> is mounted with explicit
 * dimensions so Cytoscape's first layout pass has a non-zero canvas to measure.
 *
 * Layout dispatch:
 *   - First run (no persisted positions): cy.layout({name:'fcose', ...}).run()
 *     — captures positions to vscodeApi.setState() after layout settles.
 *   - Subsequent runs (and remount-after-hide): cy.layout({name:'preset',
 *     positions:fn}).run() — preserves the user-visible node arrangement.
 *
 * The effect re-runs whenever `props.snapshot` changes (slider drag => new asOf =>
 * new node/edge set). The Cytoscape instance is reused across re-renders; only
 * elements and layout are swapped. `cy.batch()` wraps the remove+add to avoid
 * intermediate paint frames.
 */
export function Graph(props: GraphProps): React.ReactElement {
	const containerRef = useRef<HTMLDivElement>(null);
	const cyRef = useRef<cytoscape.Core | null>(null);
	// Seed from getState() so cross-mount remounts (after panel hide+reshow) skip
	// fcose and use preset with persisted positions (RESEARCH Risk 5 — Issue #5).
	const isFirstRunRef = useRef<boolean>(vscodeApi.getState()?.nodePositions === undefined);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}
		// The Cytoscape mount + layout sequence is wrapped in try/catch so a failed
		// canvas-context acquisition (jsdom test environment — getContext('2d') returns
		// null) does NOT propagate up to React's reconciler and tear down the rest of the
		// inspector chrome (header / banner / slider). In production the canvas IS real
		// and the catch branch never fires; in tests the catch keeps the surrounding DOM
		// intact so jsdom-compatible unit tests for the non-graph chrome still observe a
		// fully-rendered tree. Plan 15-05 phase-verify covers the real-canvas paths under
		// playwright.
		try {
			if (!cyRef.current) {
				cyRef.current = cytoscape({
					container,
					elements: [],
					hideEdgesOnViewport: true,
					textureOnViewport: true,
					pixelRatio: 1,
					motionBlur: false,
					wheelSensitivity: 0.2,
					minZoom: 0.1,
					maxZoom: 4,
					style: GRAPHIFY_STYLE,
				});
				if (props.onSelectNode) {
					cyRef.current.on('select', 'node', (e: cytoscape.EventObject) => {
						const id = (e.target as cytoscape.NodeSingular).id();
						props.onSelectNode!(id);
					});
				}
			}
			const cy = cyRef.current;

			const elements: cytoscape.ElementDefinition[] = [
				...props.snapshot.nodes.map(kernelRowToCyElement),
				...props.snapshot.edges.map(edgeRowToCyElement),
			];

			cy.batch(() => {
				cy.elements().remove();
				cy.add(elements);
			});

			if (isFirstRunRef.current) {
				// fcose layout options — `as cytoscape.LayoutOptions` cast because the
				// fcose extension's option keys (nodeRepulsion, idealEdgeLength, etc.)
				// are not in @types/cytoscape's LayoutOptions union.
				const fcoseLayout = {
					name: 'fcose',
					quality: 'default',
					randomize: true,
					animate: false,
					fit: true,
					padding: 40,
					nodeRepulsion: 4500,
					idealEdgeLength: 80,
					edgeElasticity: 0.45,
					gravity: 0.25,
					numIter: 2500,
					packComponents: true,
				} as unknown as cytoscape.LayoutOptions;
				cy.layout(fcoseLayout).run();
				// Capture positions for persistence — runs synchronously after
				// fcose layout completes (animate:false guarantees sync settle).
				const positions: Record<string, { x: number; y: number }> = {};
				cy.nodes().forEach((n: cytoscape.NodeSingular) => {
					positions[n.id()] = { x: n.position('x'), y: n.position('y') };
				});
				const prev = vscodeApi.getState() ?? {};
				vscodeApi.setState({ ...prev, nodePositions: positions });
				isFirstRunRef.current = false;
			} else {
				const state = vscodeApi.getState() ?? {};
				const persistedPositions = state.nodePositions ?? {};
				const presetLayout = {
					name: 'preset',
					positions: (node: cytoscape.NodeSingular) =>
						persistedPositions[node.id()] ?? undefined,
					fit: false,
				} as unknown as cytoscape.LayoutOptions;
				cy.layout(presetLayout).run();
			}
		} catch (err) {
			console.warn('[goatide-inspector] Graph mount/update skipped (no canvas):', err);
		}
	}, [props.snapshot, props.onSelectNode, props]);

	useEffect(() => {
		// Cleanup on unmount — destroy the Cytoscape instance to release the canvas
		// + listeners. CLAUDE.md disposable discipline.
		return () => {
			if (cyRef.current) {
				cyRef.current.destroy();
				cyRef.current = null;
			}
		};
	}, []);

	return <div id="cy" ref={containerRef} style={{ width: '100%', height: 'calc(100vh - 100px)' }} />;
}
