/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// esbuild bundle config for the goatide-bridge webview — Phase 4 (Plan 04-01).
//
// Webview is a browser-platform iife bundle. Monaco loads from the npm bundle (not CDN —
// see RESEARCH.md ## Pitfall 3) so monaco-editor is bundled in. CSS + .ttf loaders cover
// monaco's syntax-highlighting CSS and codicons font.
//
// Wave-0: src/canvas/webview/index.tsx is a one-line placeholder; Plan 04-03 replaces it
// with the real React entry.

import esbuild from 'esbuild';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

await esbuild.build({
	entryPoints: [path.resolve(__dirname, 'src/canvas/webview/index.tsx')],
	bundle: true,
	outfile: path.resolve(__dirname, 'dist/canvas/index.js'),
	platform: 'browser',
	format: 'iife',
	target: ['es2022'],
	loader: { '.ttf': 'file', '.css': 'css' },
	minify: isProd,
	sourcemap: 'inline',
	define: {
		'process.env.NODE_ENV': JSON.stringify(isProd ? 'production' : 'development'),
	},
	logLevel: 'info',
});
