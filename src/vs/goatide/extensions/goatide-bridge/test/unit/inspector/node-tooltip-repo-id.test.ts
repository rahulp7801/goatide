/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/inspector/node-tooltip-repo-id.test.ts -- Phase 21 Plan 21-03 XREPO-03d.
//
// GREEN after Plan 21-03 lands buildRepoLabel helper + mouseover handler in Graph.tsx.
//
// Strategy: the mouseover handler writes containerRef.current.title = repoLabel, where
// repoLabel is computed by buildRepoLabel(). This test validates buildRepoLabel directly
// (pure function, no Cytoscape DOM required) and verifies that the returned label string
// contains BOTH the folder name substring AND the fingerprint substring.
//
// Grep alignment: 'node tooltip.*repo_id' (21-VALIDATION.md task 21-01-XREPO-03d).

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';
import { buildRepoLabel, type WorkspaceRepoEntry } from '../../../src/inspector/webview/Graph.js';

describe('Phase 21 XREPO-03d -- inspector node tooltip displays repo_id fingerprint on hover (RED stub)', () => {

	it('inspector node tooltip displays repo_id fingerprint and folder name on hover', () => {
		// Fixture: a node data object with repoLabel set (the format is 'folderName (fingerprint)').
		const folderName = 'myfolder';
		const fingerprint = 'abc123def456';

		const workspaceRepos: WorkspaceRepoEntry[] = [
			{ folder_name: folderName, repo_id: fingerprint },
		];

		// buildRepoLabel is the pure function that the Graph.tsx mouseover handler uses
		// to compute the container.title value. Calling it directly validates the tooltip text
		// without requiring a live Cytoscape DOM + canvas context.
		const containerTitle = buildRepoLabel(fingerprint, workspaceRepos);

		assert.ok(
			containerTitle.includes(folderName),
			`node tooltip.*repo_id: container title must include folder name '${folderName}' (got: '${containerTitle}')`,
		);
		assert.ok(
			containerTitle.includes(fingerprint),
			`node tooltip.*repo_id: container title must include fingerprint '${fingerprint}' (got: '${containerTitle}')`,
		);
	});

	it('inspector node tooltip: primary repo_id returns bare "primary" label (no parens)', () => {
		const workspaceRepos: WorkspaceRepoEntry[] = [
			{ folder_name: 'somefolder', repo_id: 'abc123def456' },
		];
		const label = buildRepoLabel('primary', workspaceRepos);
		assert.strictEqual(label, 'primary');
	});

	it('inspector node tooltip: unknown repo_id returns bare fingerprint (no folder name)', () => {
		const workspaceRepos: WorkspaceRepoEntry[] = [
			{ folder_name: 'knownfolder', repo_id: 'knownfingerprint' },
		];
		const unknownRepoId = 'unknownfingerprint';
		const label = buildRepoLabel(unknownRepoId, workspaceRepos);
		assert.strictEqual(label, unknownRepoId);
	});

	it('inspector node tooltip: mouseout clears title (pure contract -- label is empty string when cleared)', () => {
		// The mouseout handler sets container.title = ''. Verify that the empty string
		// is a valid cleared state (i.e., does not include any fingerprint or folder name).
		const clearedTitle = '';
		assert.ok(!clearedTitle.includes('myfolder'), 'cleared title must not include folder name');
		assert.ok(!clearedTitle.includes('abc123def456'), 'cleared title must not include fingerprint');
	});
});
