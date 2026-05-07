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

// Phase-5 additions — TerminalShellExecution mock + git-extension mock.
//
// Plan 05-04 (TELE-03 terminal events) drives onDidStart/EndTerminalShellExecution; the
// mock TerminalShellExecution exposes commandLine and an async iterable read(). Plan 05-03
// (TELE-04 bridge git-commit trigger) reads vscode.extensions.getExtension('vscode.git')
// and walks its exported GitAPI to subscribe to Repository.onDidCommit. Tests inject
// repos via addMockGitRepository.

interface MockTerminalShellExecutionLike {
	readonly commandLine: { value: string; confidence: number };
	readonly cwd?: { fsPath: string };
	read(): AsyncIterable<string>;
}

export function createTerminalShellExecutionMock(input: { command: string; output: string; cwd?: string; confidence?: number }): MockTerminalShellExecutionLike {
	return {
		commandLine: { value: input.command, confidence: input.confidence ?? 2 },
		cwd: input.cwd ? { fsPath: input.cwd } : undefined,
		async *read() {
			yield input.output;
		},
	};
}

const onDidStartTerminalShellExecutionEmitter = new EventEmitterStub<{ execution: MockTerminalShellExecutionLike }>();
const onDidEndTerminalShellExecutionEmitter = new EventEmitterStub<{ execution: MockTerminalShellExecutionLike; exitCode: number | null }>();

// Phase-5 Plan 04 — TELE-02 editor event watcher substrate. Tests fire mocked
// onDidSaveTextDocument + onDidChangeTextDocument events through these emitters; the
// production registerEditorEventWatcher subscribes via vscode.workspace.* exports below.
// resetEditorEventEmitters drops listeners from all editor emitters so each test starts
// with a clean dispatch table (Phase-4 Module._cache injection caches the stub once;
// per-test reset is the right granularity).

export interface MockTextDocument {
	readonly uri: { toString: () => string; fsPath: string };
	readonly languageId: string;
	readonly lineCount: number;
}

const onDidSaveTextDocumentEmitter = new EventEmitterStub<MockTextDocument>();
const onDidChangeTextDocumentEmitter = new EventEmitterStub<{ document: MockTextDocument }>();

export function fireDidSaveTextDocument(doc: MockTextDocument): void {
	onDidSaveTextDocumentEmitter.fire(doc);
}

export function fireDidChangeTextDocument(doc: MockTextDocument): void {
	onDidChangeTextDocumentEmitter.fire({ document: doc });
}

export function resetEditorEventEmitters(): void {
	onDidSaveTextDocumentEmitter.dispose();
	onDidChangeTextDocumentEmitter.dispose();
	onDidStartTerminalShellExecutionEmitter.dispose();
	onDidEndTerminalShellExecutionEmitter.dispose();
}

interface MockGitRepository {
	readonly rootUri: { fsPath: string };
	readonly state: { HEAD: { commit: string; name: string } | undefined };
	readonly onDidCommit: (listener: () => void) => DisposableLike;
}

const onDidOpenRepositoryEmitter = new EventEmitterStub<MockGitRepository>();
const mockGitRepositories: MockGitRepository[] = [];

const mockGitAPI = {
	repositories: mockGitRepositories,
	onDidOpenRepository: onDidOpenRepositoryEmitter.event,
};

const mockGitExtension = {
	id: 'vscode.git',
	isActive: true,
	activate: async (): Promise<typeof mockGitExtension.exports> => mockGitExtension.exports,
	exports: {
		getAPI: (_v: number) => mockGitAPI,
	},
};

export function addMockGitRepository(repo: MockGitRepository): void {
	mockGitRepositories.push(repo);
	onDidOpenRepositoryEmitter.fire(repo);
}

export function fireTerminalShellExecutionStart(execution: MockTerminalShellExecutionLike): void {
	onDidStartTerminalShellExecutionEmitter.fire({ execution });
}

export function fireTerminalShellExecutionEnd(execution: MockTerminalShellExecutionLike, exitCode: number | null): void {
	onDidEndTerminalShellExecutionEmitter.fire({ execution, exitCode });
}

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
		// Phase-5 TELE-03 — stable terminal-shell-execution events.
		onDidStartTerminalShellExecution: onDidStartTerminalShellExecutionEmitter.event,
		onDidEndTerminalShellExecution: onDidEndTerminalShellExecutionEmitter.event,
	},
	workspace: {
		onWillSaveTextDocument: (): DisposableLike => ({ dispose: () => undefined }),
		// Phase-5 TELE-02 — editor save/change emitters. registerEditorEventWatcher subscribes
		// here; tests fire via fireDidSaveTextDocument/fireDidChangeTextDocument helpers.
		onDidSaveTextDocument: onDidSaveTextDocumentEmitter.event,
		onDidChangeTextDocument: onDidChangeTextDocumentEmitter.event,
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
	// Phase-5 TELE-04 — built-in vscode.git extension surface.
	extensions: {
		getExtension: (id: string): typeof mockGitExtension | undefined => id === 'vscode.git' ? mockGitExtension : undefined,
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
