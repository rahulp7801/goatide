/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/canvas/webview/index.tsx - Phase 4 (Plan 04-03) webview entry.
//
// CDN bypass for Monaco (Pitfall 3): loader.config({ monaco }) at module-load. Custom-element
// registration: import @vscode-elements/elements/dist/main.js for side-effects.

import * as React from 'react';
import * as monaco from 'monaco-editor';
import { loader } from '@monaco-editor/react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { WebviewRpc, type VsCodeApi } from '../rpc.js';
import '@vscode/codicons/dist/codicon.css';
import '@vscode-elements/elements/dist/main.js';
import './styles.css';

// CDN bypass - load monaco from this bundle. Verify in dev: no `cdn.jsdelivr.net` requests.
loader.config({ monaco });

declare function acquireVsCodeApi(): VsCodeApi;

const vscode = acquireVsCodeApi();
const rpc = new WebviewRpc(vscode);

const rootEl = document.getElementById('root');
if (!rootEl) {
	throw new Error('[goatide-canvas] #root not found in DOM');
}
const root = createRoot(rootEl);
root.render(<App rpc={rpc} />);
