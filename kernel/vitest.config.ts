/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		include: ['src/**/*.spec.ts'],
		// SQLite native module needs process isolation per test file: default 'threads' pool
		// uses worker_threads which can produce module-loading races on better-sqlite3's native
		// binding. Forks give each test file its own process so the binding loads cleanly.
		pool: 'forks',
		poolOptions: { forks: { singleFork: false } },
		// Generous timeouts: temp-DB tests do mkdtempSync + drizzle-kit migrate + assertions.
		testTimeout: 10_000,
		hookTimeout: 10_000,
		reporters: process.env.CI ? ['default'] : ['default'],
	},
});
