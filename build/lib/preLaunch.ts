/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import path from 'path';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const rootDir = path.resolve(import.meta.dirname, '..', '..');

function runProcess(command: string, args: ReadonlyArray<string> = []) {
	return new Promise<void>((resolve, reject) => {
		const child = spawn(command, args, { cwd: rootDir, stdio: 'inherit', env: process.env, shell: process.platform === 'win32' });
		child.on('exit', err => !err ? resolve() : process.exit(err ?? 1));
		child.on('error', reject);
	});
}

async function exists(subdir: string) {
	try {
		await fs.stat(path.join(rootDir, subdir));
		return true;
	} catch {
		return false;
	}
}

async function ensureNodeModules() {
	if (!(await exists('node_modules'))) {
		await runProcess(npm, ['ci']);
	}
}

async function getElectron() {
	await runProcess(npm, ['run', 'electron']);
}

// Phase 9 BUILD-RT-01: sentinel files that MUST exist after a complete compile+transpile
// cycle. `out/main.js` is the Electron entry point produced by transpile-client; the two
// `out/vs/...` files come from `npm run compile` (gulp). Checking the directory alone is
// insufficient — `npm run compile` can succeed yet leave `out/main.js` absent, producing
// a runnable-looking build that crashes with `Cannot find module './out/main.js'`.
const SENTINELS = [
	'out/main.js',
	'out/vs/base/common/arrays.js',
	'out/vs/code/electron-main/main.js',
];

export async function findMissingSentinels(baseDir: string = rootDir): Promise<string[]> {
	const missing: string[] = [];
	for (const sentinel of SENTINELS) {
		const full = path.join(baseDir, sentinel);
		try {
			await fs.stat(full);
		} catch {
			missing.push(sentinel);
		}
	}
	return missing;
}

export type RunProcess = (command: string, args: ReadonlyArray<string>) => Promise<void>;

export async function ensureCompiled(runner: RunProcess = runProcess) {
	const missing = await findMissingSentinels();
	if (missing.length > 0) {
		console.log(`[preLaunch] Build incomplete (missing: ${missing.join(', ')}). Running compile + transpile...`);
		await runner(npm, ['run', 'compile']);
		// After BUILD-RT-02 lands (`npm run compile` chains `transpile-client`), this becomes a no-op.
		// Keep explicit for belt-and-suspenders + clarity in error messages.
		await runner(npm, ['run', 'transpile-client']);
	}
}

async function main() {
	await ensureNodeModules();
	await getElectron();
	await ensureCompiled();

	// Can't require this until after dependencies are installed
	const { getBuiltInExtensions } = await import('./builtInExtensions.ts');
	await getBuiltInExtensions();
}

if (import.meta.main) {
	main().catch(err => {
		console.error(err);
		process.exit(1);
	});
}
