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

const raw: VsCodeApiRaw = acquireVsCodeApi();

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
