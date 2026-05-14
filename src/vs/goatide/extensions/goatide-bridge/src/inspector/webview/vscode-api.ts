/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/inspector/webview/vscode-api.ts —
// Phase 15 Plan 15-04 (Wave 3 — DEEP-02).
//
// Type-safe wrapper around the global `acquireVsCodeApi()` function the VS Code
// webview runtime injects. Mirrors the canvas-side pattern from
// src/canvas/webview/index.tsx (Plan 04-03) — `declare function acquireVsCodeApi()`
// + a single getState/setState/postMessage call. The inspector adds typed state for
// position persistence (RESEARCH Risk 5 — cross-mount persistence via
// vscode.setState which survives `retainContextWhenHidden: false` teardown).
//
// Singleton: `acquireVsCodeApi()` MUST be called exactly once per webview lifetime
// (the VS Code runtime throws on a second invocation). This file exports a single
// already-acquired `vscodeApi` value.

/**
 * Typed shape of the persisted state slot. Today only `nodePositions` is written;
 * `currentAsOf` is reserved for a future refinement that wants to recover the
 * slider position across reload. Kept here so consumers see one place to read.
 */
export interface InspectorWebviewState {
	nodePositions?: Record<string, { x: number; y: number }>;
	currentAsOf?: string;
}

/** Inbound shape from `acquireVsCodeApi()`. Matches `src/canvas/rpc.ts` VsCodeApi. */
interface VsCodeApiRaw {
	postMessage(message: unknown): void;
	getState(): unknown;
	setState(state: unknown): void;
}

declare function acquireVsCodeApi(): VsCodeApiRaw;

/** Public typed wrapper — `postMessage`, plus narrowed `getState` / `setState`. */
export interface VsCodeApi {
	postMessage(message: unknown): void;
	getState(): InspectorWebviewState | undefined;
	setState(state: InspectorWebviewState): void;
}

/**
 * Acquire the VS Code API in production; fall back to an in-memory stub when
 * `acquireVsCodeApi` is not present on the global (jsdom / mocha test runtime). The
 * stub holds a single in-memory `state` slot so getState/setState round-trip works
 * for unit tests of Graph.tsx position persistence; postMessage is a noop in tests.
 * The Plan 15-04 webview entrypoint (index.tsx) only runs under the real VS Code
 * webview, where `acquireVsCodeApi` is injected by the runtime — the fallback path
 * here is exclusively for test reachability of the module graph.
 */
function acquireVsCodeApiSafe(): VsCodeApiRaw {
	const g = globalThis as unknown as { acquireVsCodeApi?: () => VsCodeApiRaw };
	if (typeof g.acquireVsCodeApi === 'function') {
		return g.acquireVsCodeApi();
	}
	let inMemoryState: unknown = undefined;
	return {
		postMessage: (_message: unknown): void => { /* test-stub noop */ },
		getState: (): unknown => inMemoryState,
		setState: (state: unknown): void => { inMemoryState = state; },
	};
}

const raw: VsCodeApiRaw = acquireVsCodeApiSafe();

/**
 * The singleton typed VS Code API surface for the inspector webview. Use this
 * everywhere — DO NOT call `acquireVsCodeApi()` again (the runtime throws).
 *
 * `getState()` is cast through `unknown` to the narrowed `InspectorWebviewState`;
 * the cast is safe because the webview is the sole writer of this state slot.
 */
export const vscodeApi: VsCodeApi = {
	postMessage: (message: unknown) => raw.postMessage(message),
	getState: () => raw.getState() as InspectorWebviewState | undefined,
	setState: (state: InspectorWebviewState) => raw.setState(state),
};
