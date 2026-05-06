/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/setup/vscode-stub.ts — Plan 04-05.
//
// Inject a minimal `vscode` API stub into Node's CJS module cache BEFORE any test file
// imports a bridge source module that depends on `vscode`. The bridge ships against
// VS Code's extension host where `vscode` is a built-in module; in mocha there's no host
// so we emulate just enough surface for the integration tests to drive KernelClient,
// ConnectionStateMachine, and the recovery scan.
//
// Mocha loads this via .mocharc.cjs `file:` BEFORE the spec files. The stub is intentionally
// minimal — only the symbols our tested code-path touches.

import nodeModule from 'node:module';

interface DisposableLike {
	dispose: () => void;
}

class EventEmitterStub<T> {
	private readonly listeners = new Set<(e: T) => void>();
	readonly event = (listener: (e: T) => void): DisposableLike => {
		this.listeners.add(listener);
		return { dispose: () => this.listeners.delete(listener) };
	};
	fire(e: T): void {
		for (const l of this.listeners) {
			l(e);
		}
	}
	dispose(): void {
		this.listeners.clear();
	}
}

// Plan 04-06: status-bar surfaces. createStatusBarItem returns a recordable stub so tests
// can assert on text/backgroundColor/show/hide calls. StatusBarAlignment + ThemeColor are
// real-enough surrogates.
class StatusBarItemStub {
	text = '';
	tooltip: string | undefined = undefined;
	command: string | undefined = undefined;
	backgroundColor: ThemeColorStub | undefined = undefined;
	visible = false;
	disposed = false;
	show(): void { this.visible = true; }
	hide(): void { this.visible = false; }
	dispose(): void { this.disposed = true; }
}

class ThemeColorStub {
	constructor(public readonly id: string) { }
}

// Recordable showErrorMessage spy — Plan 04-06 tests assert it was called with the
// 'destructive save blocked' phrase. The stub returns undefined (no Reconnect button
// click) by default. Tests can override via swapRespondingShowErrorMessage helper if
// they need to drive the Reconnect path.
const showErrorMessageSpy: { calls: unknown[][]; respondWith: string | undefined } = {
	calls: [],
	respondWith: undefined,
};

const vscodeStub = {
	EventEmitter: EventEmitterStub,
	TextDocumentSaveReason: { Manual: 1, AfterDelay: 2, FocusOut: 3 },
	ViewColumn: { Active: -1, Beside: -2, One: 1, Two: 2, Three: 3 },
	StatusBarAlignment: { Left: 1, Right: 2 },
	ThemeColor: ThemeColorStub,
	window: {
		showInformationMessage: async (..._args: unknown[]): Promise<string | undefined> => undefined,
		showErrorMessage: async (...args: unknown[]): Promise<string | undefined> => {
			showErrorMessageSpy.calls.push(args);
			return showErrorMessageSpy.respondWith;
		},
		createWebviewPanel: () => {
			throw new Error('createWebviewPanel: not stubbed (extension-host only)');
		},
		createStatusBarItem: (_alignment?: number, _priority?: number): StatusBarItemStub => new StatusBarItemStub(),
	},
	workspace: {
		onWillSaveTextDocument: (): DisposableLike => ({ dispose: () => undefined }),
		findFiles: async (_pattern: string): Promise<unknown[]> => [],
		getConfiguration: (_section?: string) => ({
			get: <T>(_key: string, defaultValue: T): T => defaultValue,
		}),
		workspaceFolders: undefined as unknown,
	},
	commands: {
		registerCommand: (..._args: unknown[]): DisposableLike => ({ dispose: () => undefined }),
		executeCommand: async (..._args: unknown[]): Promise<unknown> => undefined,
	},
	Uri: {
		joinPath: (..._args: unknown[]): unknown => ({ fsPath: '' }),
	},
	Disposable: class {
		constructor(private readonly fn?: () => void) { }
		dispose(): void { this.fn?.(); }
	},
	// Test-only escape hatches for the showErrorMessage spy. These are not part of the
	// real vscode API but tests can read them via `import * as vscode from 'vscode'` and
	// then `(vscode as any).__test_showErrorMessageSpy`.
	__test_showErrorMessageSpy: showErrorMessageSpy,
	__test_StatusBarItemStub: StatusBarItemStub,
	__test_ThemeColorStub: ThemeColorStub,
};

// Node's internal Module._resolveFilename + _cache surface (not in @types/node public API).
interface ModuleInternals {
	_resolveFilename: (
		this: typeof nodeModule,
		request: string,
		parent: NodeJS.Module | null,
		isMain: boolean,
		options?: object,
	) => string;
	_cache: Record<string, NodeJS.Module>;
}

const moduleInternals = nodeModule as unknown as ModuleInternals;

// Inject into Node's CJS resolver so any subsequent `require('vscode')` returns the stub.
// Mocha invokes this `file:` hook synchronously before spec loading.
const origResolve = moduleInternals._resolveFilename;
moduleInternals._resolveFilename = function (
	this: typeof nodeModule,
	request: string,
	parent: NodeJS.Module | null,
	isMain: boolean,
	options?: object,
): string {
	if (request === 'vscode') {
		return 'vscode'; // sentinel — handled below in cache
	}
	return origResolve.call(this, request, parent, isMain, options);
};

function buildStubCacheEntry(): NodeJS.Module {
	const entry: { id: string; filename: string; loaded: boolean; exports: unknown } = {
		id: 'vscode',
		filename: 'vscode',
		loaded: true,
		exports: vscodeStub,
	};
	return entry as unknown as NodeJS.Module;
}

moduleInternals._cache['vscode'] = buildStubCacheEntry();
