/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/inspector/webview/App.tsx —
// Phase 15 Plan 15-04 (Wave 3 — DEEP-02 top-level webview component).
//
// Composition layer that:
//   - Subscribes to inspector.show / inspector.error messages from the host via the
//     WebviewRpc transport (Plan 15-03 rpc.ts).
//   - On mount: posts inspector.ready so the host can dispatch the initial snapshot
//     (which includes the transitions[] step set populating the Slider).
//   - On slider drag: posts inspector.requestSnapshot(asOf) — asOf threaded verbatim
//     from transitions[idx], NO Date() math in the slider RPC path (Pitfall 1).
//   - Renders the locked SC#2 header literal "Viewing snapshot — graph is read-only"
//     (byte-equal including the em-dash U+2014).
//   - Composes Graph + Slider + TruncationBanner around the snapshot state.
//
// Issue #1 (gsd-plan-checker) translation boundary: kernel wire shape uses node_id /
// edge_id / src_id / dst_id field names (Plan 15-02 SerializedNodeSnapshot /
// SerializedEdgeSnapshot, mirrored verbatim in Plan 15-03 messages.ts). The webview-internal
// InspectorNodeRow / InspectorEdgeRow shape uses post-projection `id` (matches the
// CytoscapeNodeElement.data.id contract that kernelRowToCyElement expects). The translation
// runs at the inspector.show dispatch boundary below.
//
// Mandate B fence: this file imports ZERO bare KernelClient references (only `import type`
// for the wire shape via inspector/messages.ts). The webview never sends a write RPC; the
// outbound message union is {inspector.ready | inspector.requestSnapshot} only.

import * as React from 'react';
import { useEffect, useReducer } from 'react';
import type { WebviewRpc } from '../rpc.js';
import type { InspectorNodeRow } from '../kernelRowToCyElement.js';
import type { InspectorEdgeRow } from '../edgeRowToCyElement.js';
import {
	wireToInspectorNodeRow,
	wireToInspectorEdgeRow,
	type WireNodeSnapshot,
	type WireEdgeSnapshot,
} from './wireToInspectorRow.js';
import { Graph, type WorkspaceRepoEntry } from './Graph.js';
import { Slider } from './Slider.js';
import { TruncationBanner } from './TruncationBanner.js';
import { PALETTE } from './palette.js';

interface AppState {
	currentAsOf: string | null;
	nodes: InspectorNodeRow[];
	edges: InspectorEdgeRow[];
	transitions: string[];
	truncated: boolean;
	loading: boolean;
	error: string | null;
	selectedNodeId: string | null;
	/** Phase 21 XREPO-03 -- workspace repos from inspector.show payload for node tooltip repoLabel. */
	workspaceRepos: WorkspaceRepoEntry[];
}

type Action =
	| {
		type: 'show';
		asOf: string;
		nodes: InspectorNodeRow[];
		edges: InspectorEdgeRow[];
		truncated: boolean;
		transitions: string[] | undefined;
		workspaceRepos: WorkspaceRepoEntry[] | undefined;
	}
	| { type: 'error'; reason: string }
	| { type: 'select'; id: string }
	| { type: 'requestSnapshot'; asOf: string };

function reducer(state: AppState, action: Action): AppState {
	switch (action.type) {
		case 'show':
			return {
				...state,
				currentAsOf: action.asOf,
				nodes: action.nodes,
				edges: action.edges,
				truncated: action.truncated,
				transitions: action.transitions ?? state.transitions,
				workspaceRepos: action.workspaceRepos ?? state.workspaceRepos,
				loading: false,
				error: null,
			};
		case 'error':
			return { ...state, loading: false, error: action.reason };
		case 'select':
			return { ...state, selectedNodeId: action.id };
		case 'requestSnapshot':
			return { ...state, loading: true };
	}
}

const INITIAL_STATE: AppState = {
	currentAsOf: null,
	nodes: [],
	edges: [],
	transitions: [],
	truncated: false,
	loading: true,
	error: null,
	selectedNodeId: null,
	workspaceRepos: [],
};

export interface AppProps {
	readonly rpc: WebviewRpc;
}

/**
 * Top-level React component for the bitemporal Graph Inspector webview. Owns the
 * snapshot reducer state; subscribes to host messages on mount; dispatches translated
 * wire-shape rows through the wireToInspectorRow adapter at the parse boundary.
 *
 * Header literal "Viewing snapshot — graph is read-only" is locked by ROADMAP SC#2 +
 * RESEARCH Section 6 (byte-equal, em-dash U+2014). The Wave-0 RED test
 * inspector-app-header.test.tsx queries the data-testid below and asserts the literal.
 */
export function App({ rpc }: AppProps): React.ReactElement {
	const [state, dispatch] = useReducer(reducer, INITIAL_STATE);

	useEffect(() => {
		const unsubscribe = rpc.subscribe((msg) => {
			if (msg.type === 'inspector.show') {
				// Issue #1 fix — translate wire shape (node_id / edge_id) → InspectorRow shape (id)
				// via adapter at the parse boundary. Keeps kernel wire contract intact (msg.nodes is
				// SerializedNodeSnapshot[]); state slot is InspectorNodeRow[].
				dispatch({
					type: 'show',
					asOf: msg.asOf,
					nodes: msg.nodes.map((n) => wireToInspectorNodeRow(n as WireNodeSnapshot)),
					edges: msg.edges.map((e) => wireToInspectorEdgeRow(e as WireEdgeSnapshot)),
					truncated: msg.truncated,
					transitions: msg.transitions,
					// Phase 21 XREPO-03 -- thread workspace_repos from inspector.show into reducer state.
					workspaceRepos: msg.workspace_repos as WorkspaceRepoEntry[] | undefined,
				});
			} else if (msg.type === 'inspector.error') {
				dispatch({ type: 'error', reason: msg.reason });
			}
		});
		rpc.postReady();
		return unsubscribe;
	}, [rpc]);

	const handleAsOfChange = (asOf: string): void => {
		dispatch({ type: 'requestSnapshot', asOf });
		rpc.postRequestSnapshot(asOf);
	};

	return (
		<div className="inspector-root" style={{ background: PALETTE.bg }}>
			<header className="inspector-header">
				<span data-testid="inspector-header-readonly">Viewing snapshot — graph is read-only</span>
			</header>
			{state.truncated && <TruncationBanner count={state.nodes.length} />}
			{state.error && <div className="inspector-error">{state.error}</div>}
			<Graph
				snapshot={{ nodes: state.nodes, edges: state.edges }}
				onSelectNode={(id) => dispatch({ type: 'select', id })}
				workspaceRepos={state.workspaceRepos}
			/>
			{state.transitions.length > 0 && state.currentAsOf !== null && (
				<Slider
					transitions={state.transitions}
					currentAsOf={state.currentAsOf}
					onAsOfChange={handleAsOfChange}
				/>
			)}
		</div>
	);
}
