/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Proves vitest runs end-to-end before any graph code lands.

import { describe, it, expect } from 'vitest';
import { mkTempDb } from './helpers/temp-db.js';

describe('vitest sanity', () => {
	it('arithmetic still works', () => {
		expect(1 + 1).toBe(2);
	});

	it('mkTempDb returns a dispose-able temp dir', () => {
		const tmp = mkTempDb();
		expect(tmp.dbPath).toMatch(/goatide-graph-/);
		expect(tmp.dir).toBeTruthy();
		tmp.dispose();
		// Calling dispose twice must not throw.
		tmp.dispose();
	});
});
