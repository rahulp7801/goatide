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

const vscodeStub = {
	EventEmitter: EventEmitterStub,
	TextDocumentSaveReason: { Manual: 1, AfterDelay: 2, FocusOut: 3 },
	ViewColumn: { Active: -1, Beside: -2, One: 1, Two: 2, Three: 3 },
	window: {
		showInformationMessage: async (..._args: unknown[]): Promise<string | undefined> => undefined,
		showErrorMessage: async (..._args: unknown[]): Promise<string | undefined> => undefined,
		createWebviewPanel: () => {
			throw new Error('createWebviewPanel: not stubbed (extension-host only)');
		},
	},
	workspace: {
		onWillSaveTextDocument: (): DisposableLike => ({ dispose: () => undefined }),
		findFiles: async (_pattern: string): Promise<unknown[]> => [],
		getConfiguration: (_section?: string) => ({
			get: <T>(_key: string, defaultValue: T): T => defaultValue,
		}),
	},
	commands: {
		registerCommand: (..._args: unknown[]): DisposableLike => ({ dispose: () => undefined }),
	},
	Uri: {
		joinPath: (..._args: unknown[]): unknown => ({ fsPath: '' }),
	},
	Disposable: class {
		constructor(private readonly fn?: () => void) { }
		dispose(): void { this.fn?.(); }
	},
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
