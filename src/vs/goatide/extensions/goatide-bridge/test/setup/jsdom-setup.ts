/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/setup/jsdom-setup.ts - Phase 4 (Plan 04-03) jsdom environment for React Testing Library.
//
// Loaded via mocha's `file:` option BEFORE any .test.tsx file imports React. Mounts globals
// React expects (window, document, HTMLElement, etc.) so RTL's render() works without a browser.
// jest-dom matcher augmentation is intentionally omitted - tests use `node:assert` rather than
// jest's expect-based matchers; importing `@testing-library/jest-dom` requires a global `expect`
// which mocha doesn't provide.

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
	url: 'http://localhost',
	pretendToBeVisual: true,
});

const w = dom.window as unknown as Window & typeof globalThis;
const g = globalThis as unknown as Record<string, unknown>;

g.window = w;
g.document = w.document;
g.navigator = w.navigator;
g.HTMLElement = w.HTMLElement;
g.Element = w.Element;
g.Node = w.Node;
g.getComputedStyle = w.getComputedStyle.bind(w);
g.MessageEvent = w.MessageEvent;
