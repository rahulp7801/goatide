/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// esbuild bundle config for the goatide-bridge webview — Phase 4 (Plan 04-01) +
// Phase 15 Plan 15-03 (Wave-2 — second inspector entry, existsSync-guarded).
//
// Webview is a browser-platform iife bundle. Monaco loads from the npm bundle (not CDN —
// see RESEARCH.md ## Pitfall 3) so monaco-editor is bundled in. CSS + .ttf loaders cover
// monaco's syntax-highlighting CSS and codicons font.
//
// Phase 15 Plan 15-03 (Wave-2): a parallel esbuild.build({...}) call bundles the inspector
// webview into dist/inspector/index.js. The entry .tsx file lands in Phase 15 Plan 15-04
// (Wave 3); until then existsSync skips the inspector entry so `npm run compile` stays
// exit 0 throughout Wave-2 close state.

import esbuild from 'esbuild';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

const builds = [
	esbuild.build({
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
	}),
];

// Phase 15 Plan 15-03 (Wave-2) — inspector webview bundle. Plan 15-04 (Wave 3) creates the
// .tsx entry point; until then the existsSync guard skips the build so npm run compile
// stays exit 0. After Wave 3 lands the input file, this guard auto-enables.
const inspectorEntry = path.resolve(__dirname, 'src/inspector/webview/index.tsx');
if (fs.existsSync(inspectorEntry)) {
	builds.push(esbuild.build({
		entryPoints: [inspectorEntry],
		bundle: true,
		outfile: path.resolve(__dirname, 'dist/inspector/index.js'),
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
	}));
}

await Promise.all(builds);

// Copy index.html so panel.ts can read it from dist/canvas/index.html.
fs.mkdirSync(path.resolve(__dirname, 'dist/canvas'), { recursive: true });
fs.copyFileSync(
	path.resolve(__dirname, 'src/canvas/webview/index.html'),
	path.resolve(__dirname, 'dist/canvas/index.html'),
);

// Phase 15 Plan 15-03 (Wave-2) — copy inspector index.html if Wave 3 has landed the source.
// Same existsSync guard pattern as the bundle build above. After Wave 3 lands the input,
// this copy runs unconditionally and panel.ts's renderHtml() can load the bundled template.
const inspectorHtmlSrc = path.resolve(__dirname, 'src/inspector/webview/index.html');
if (fs.existsSync(inspectorHtmlSrc)) {
	fs.mkdirSync(path.resolve(__dirname, 'dist/inspector'), { recursive: true });
	fs.copyFileSync(
		inspectorHtmlSrc,
		path.resolve(__dirname, 'dist/inspector/index.html'),
	);
}
