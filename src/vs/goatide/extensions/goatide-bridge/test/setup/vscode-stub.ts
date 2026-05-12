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

// Phase 7 Plan 07-05 — quickPick + inputBox + registered-commands spies and configuration
// state for the goatide.setSessionPriority command palette flow + tier-dispatch
// session_priority threading. Tests drive these via the helper functions below.
const showQuickPickSpy: { calls: unknown[][]; respondWith: string | undefined } = {
	calls: [],
	respondWith: undefined,
};
const showInputBoxSpy: { calls: unknown[][]; respondWith: string | undefined } = {
	calls: [],
	respondWith: undefined,
};
const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();
const configurationStore = new Map<string, Map<string, unknown>>();

export function setQuickPickResponse(value: string | undefined): void {
	showQuickPickSpy.respondWith = value;
}

export function setInputBoxResponse(value: string | undefined): void {
	showInputBoxSpy.respondWith = value;
}

export function getRegisteredCommand(id: string): ((...args: unknown[]) => unknown) | undefined {
	return registeredCommands.get(id);
}

export function setWorkspaceConfigurationValue(section: string, key: string, value: unknown): void {
	if (!configurationStore.has(section)) {
		configurationStore.set(section, new Map());
	}
	configurationStore.get(section)!.set(key, value);
}

export function getWorkspaceConfigurationValue(section: string, key: string): unknown {
	return configurationStore.get(section)?.get(key);
}

export function resetSessionPrioritySpies(): void {
	showQuickPickSpy.calls.length = 0;
	showQuickPickSpy.respondWith = undefined;
	showInputBoxSpy.calls.length = 0;
	showInputBoxSpy.respondWith = undefined;
}

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

// Phase 12 Plan 12-01 — onWillSaveTextDocument emitter so save-gate listeners can be
// driven from mocha integration tests. The shape mirrors VS Code's
// TextDocumentWillSaveEvent: { document, reason, waitUntil(thenable) }. Listeners call
// waitUntil(...) synchronously inside the handler; the stub captures the thenable on
// the event object so tests can assert on the veto promise.
export interface MockWillSaveEvent {
	readonly document: MockTextDocument;
	readonly reason: number;
	readonly waitUntilCalls: PromiseLike<unknown>[];
	waitUntil(thenable: PromiseLike<unknown>): void;
}

const onWillSaveTextDocumentEmitter = new EventEmitterStub<MockWillSaveEvent>();

export function fireWillSaveTextDocument(document: MockTextDocument, reason: number): MockWillSaveEvent {
	const waitUntilCalls: PromiseLike<unknown>[] = [];
	const event: MockWillSaveEvent = {
		document,
		reason,
		waitUntilCalls,
		waitUntil(thenable: PromiseLike<unknown>): void {
			waitUntilCalls.push(thenable);
		},
	};
	onWillSaveTextDocumentEmitter.fire(event);
	return event;
}

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
	onWillSaveTextDocumentEmitter.dispose();
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
	// Phase 7 Plan 07-05 — ConfigurationTarget enum surface used by the goatide.setSessionPriority
	// command's update() call. Mirror of the real vscode.ConfigurationTarget shape.
	ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
	window: {
		showInformationMessage: async (..._args: unknown[]): Promise<string | undefined> => undefined,
		showErrorMessage: async (...args: unknown[]): Promise<string | undefined> => {
			showErrorMessageSpy.calls.push(args);
			return showErrorMessageSpy.respondWith;
		},
		// Phase 7 Plan 07-05 — recordable quickPick + inputBox spies for the
		// goatide.setSessionPriority command-palette test.
		showQuickPick: async (...args: unknown[]): Promise<string | undefined> => {
			showQuickPickSpy.calls.push(args);
			return showQuickPickSpy.respondWith;
		},
		showInputBox: async (...args: unknown[]): Promise<string | undefined> => {
			showInputBoxSpy.calls.push(args);
			return showInputBoxSpy.respondWith;
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
		// Phase 12 Plan 12-01 — real onWillSaveTextDocument emitter. Tests fire mock
		// TextDocumentWillSaveEvent via fireWillSaveTextDocument(doc, reason); listeners
		// registered via registerSaveGate() get invoked synchronously and may call
		// event.waitUntil(thenable) which the stub records on event.waitUntilCalls.
		onWillSaveTextDocument: onWillSaveTextDocumentEmitter.event,
		// Phase-5 TELE-02 — editor save/change emitters. registerEditorEventWatcher subscribes
		// here; tests fire via fireDidSaveTextDocument/fireDidChangeTextDocument helpers.
		onDidSaveTextDocument: onDidSaveTextDocumentEmitter.event,
		onDidChangeTextDocument: onDidChangeTextDocumentEmitter.event,
		findFiles: async (_pattern: string): Promise<unknown[]> => [],
		// Phase 7 Plan 07-05 — overridable configuration store. Tests prime values via
		// setWorkspaceConfigurationValue(section, key, value). Reads fall back to the
		// supplied default when the key isn't primed (preserves Phase-4..6 semantics).
		// update() writes into the same store so the goatide.setSessionPriority command's
		// round-trip can be asserted by the test.
		getConfiguration: (section?: string) => ({
			get: <T>(key: string, defaultValue: T): T => {
				const stored = section !== undefined ? configurationStore.get(section)?.get(key) : undefined;
				return (stored as T | undefined) ?? defaultValue;
			},
			update: async (key: string, value: unknown, _target?: number): Promise<void> => {
				const sec = section ?? '';
				if (!configurationStore.has(sec)) {
					configurationStore.set(sec, new Map());
				}
				configurationStore.get(sec)!.set(key, value);
			},
		}),
		workspaceFolders: undefined as unknown,
	},
	commands: {
		// Phase 7 Plan 07-05 — recordable registerCommand. Tests retrieve the registered
		// callback via getRegisteredCommand('goatide.setSessionPriority') and invoke it
		// directly (the real command-palette dispatch isn't simulated; the callback IS the
		// integration surface).
		registerCommand: (id: string, callback: (...args: unknown[]) => unknown): DisposableLike => {
			registeredCommands.set(id, callback);
			return { dispose: () => registeredCommands.delete(id) };
		},
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
	// Phase 7 Plan 07-05 — quickPick/inputBox/configuration spy escape hatches.
	__test_showQuickPickSpy: showQuickPickSpy,
	__test_showInputBoxSpy: showInputBoxSpy,
	__test_registeredCommands: registeredCommands,
	__test_configurationStore: configurationStore,
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
