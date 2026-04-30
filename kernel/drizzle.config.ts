/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Config } from 'drizzle-kit';

// dbCredentials intentionally omitted — `drizzle-kit generate` operates schema -> SQL without a
// live DB. `drizzle-kit migrate` (Wave 1+) needs a `--config` flag pointing at a temp DB path;
// the CLI / tests pass that explicitly.
export default {
	dialect: 'sqlite',
	schema: './src/graph/schema/index.ts', // Wave 1 (Plan 02-02) creates this file
	out: './src/graph/migrations',         // Wave 1 commits the generated SQL into this dir
	strict: true,
	verbose: true,
} satisfies Config;
