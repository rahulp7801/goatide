/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/setup/register-commands.ts — Phase 17 Plan 17-04 DEEP-06 phase-B.
//
// Mocha `file:` setup that pre-registers extension commands in the vscode-stub
// `registeredCommands` Map BEFORE any test file loads. This mirrors what
// activate() does in the real extension host, but without the host infrastructure
// (KernelClient, CanvasPanel, etc.) that activate() also wires.
//
// Why: cross-repo-command.test.ts calls vscode.commands.executeCommand(
//   'goatide.openCrossRepoGraph') which dispatches through vscode-stub's
//   registeredCommands Map. The command must be registered before the tests run.
//
// The handler is imported from src/inspector/cross-repo-command.ts (the same
// module that extension.ts activate() calls) so the logic is NOT duplicated.
// A null-coerced stub context and kernel are passed; the handler only accesses
// them when workspaceFolders.length >= 2 and getOrCreateForCrossRepo is reached —
// and that branch is patched by test 3 to return undefined before reveal() fires.

import { registerCrossRepoGraphCommand } from '../../src/inspector/cross-repo-command.js';
import type * as vscode from 'vscode';
import type { ReadonlyKernelClient } from '../../src/inspector/ReadonlyKernelClient.js';

// Stub context: the only fields the command handler path accesses are forwarded to
// GraphInspectorPanel.getOrCreateForCrossRepo, which test 3 patches to a no-op mock.
// Therefore an empty stub that satisfies the TS type surface is sufficient.
const stubContext = null as unknown as vscode.ExtensionContext;

// Stub kernel: same reasoning — the kernel parameter flows only to
// getOrCreateForCrossRepo, which is patched in the >= 2 folders test case.
const stubKernel = null as unknown as ReadonlyKernelClient;

// Register the command. The returned Disposable is intentionally not tracked — the
// registeredCommands Map lives for the entire mocha process lifetime and cleanup is
// not required between test files (each test uses try/finally to restore patches).
registerCrossRepoGraphCommand(stubContext, stubKernel);
