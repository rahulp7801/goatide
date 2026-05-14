/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/src/inspector/webview/index.tsx —
// Phase 15 Plan 15-04 (Wave 3 — DEEP-02 webview entry).
//
// React createRoot mount for the Graph Inspector webview bundle. Acquires the singleton
// VS Code API via the typed vscode-api wrapper, constructs a WebviewRpc (Plan 15-03
// rpc.ts), and renders <App rpc={rpc}/> into the #root element provided by index.html.
//
// Mandate B fence: this file imports ZERO write-RPC tokens. The outbound message union
// is structurally {inspector.ready | inspector.requestSnapshot} via the Zod-validated
// WebviewRpc transport — refuse-deep05-write.sh confirms the file source is clean.

import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { WebviewRpc } from '../rpc.js';
import { vscodeApi } from './vscode-api.js';
import './styles.css';

const rpc = new WebviewRpc(vscodeApi);

const rootEl = document.getElementById('root');
if (!rootEl) {
	throw new Error('[goatide-inspector] #root not found in DOM');
}
const root = createRoot(rootEl);
root.render(<App rpc={rpc} />);
