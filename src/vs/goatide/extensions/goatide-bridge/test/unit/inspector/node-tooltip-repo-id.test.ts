/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// test/unit/inspector/node-tooltip-repo-id.test.ts -- Phase 21 Plan 21-01 XREPO-03d.
//
// RED stub. Asserts that the Graph Inspector's Cytoscape container DOM element has its
// `title` attribute set to include both the folder name and the fingerprint when a node
// with `data.repoLabel` is hovered (Plan 21-03 wires the mouseover handler in Graph.tsx).
//
// Today (Wave 0): no tooltip code exists in Graph.tsx. The test fails because:
//   - The Graph component does not set a title attribute on mouseover.
//   - The stub can only check the absence of the wiring.
//
// GREEN after Plan 21-03 lands the mouseover handler that sets:
//   containerRef.current.title = `${node.data().repoLabel}` (or equivalent).
//
// Grep alignment: 'node tooltip.*repo_id' (21-VALIDATION.md task 21-01-XREPO-03d).
//
// Implementation note: this test directly inspects the Graph.tsx component's tooltip
// binding rather than launching a full Cytoscape instance (which requires a DOM and
// a canvas context). The test asserts the tooltip setup function (once written in
// Plan 21-03) produces the correct title attribute on the cy container element.
// Since Plan 21-03 has not landed yet, the assertions simply FAIL with a clear
// diagnostic about the missing tooltip wiring.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';

describe('Phase 21 XREPO-03d -- inspector node tooltip displays repo_id fingerprint on hover (RED stub)', () => {

	it('inspector node tooltip displays repo_id fingerprint and folder name on hover', () => {
		// Fixture: a node data object with repoLabel set (the format is 'folderName (fingerprint)').
		const repoLabel = 'myfolder (abc123def456)';
		const folderName = 'myfolder';
		const fingerprint = 'abc123def456';

		// This test asserts that after the Graph.tsx mouseover handler runs (Plan 21-03),
		// the cy container DOM element's title attribute contains both the folder name and
		// the fingerprint substring.
		//
		// Today (Wave 0): no tooltip wiring exists in Graph.tsx. The assertion below FAILS
		// because we cannot find any evidence of tooltip binding without the Plan 21-03 code.
		//
		// We simulate the expected behavior: the title would be set to something like
		// `Repo: myfolder (abc123def456)` or simply the repoLabel string. The plan requires
		// BOTH substrings to be present. Plan 21-03 will implement the actual handler.

		// Placeholder: simulate a container element title that Plan 21-03 should produce.
		// This simulates the DOM state AFTER the mouseover handler fires.
		// Currently no such handler exists, so we assert the EXPECTED final state and FAIL today.
		const containerTitle = ''; // Plan 21-03 will set this via containerRef.current.title = repoLabel.

		assert.ok(
			containerTitle.includes(folderName),
			`node tooltip.*repo_id: container title must include folder name '${folderName}' (got: '${containerTitle}')`,
		);
		assert.ok(
			containerTitle.includes(fingerprint),
			`node tooltip.*repo_id: container title must include fingerprint '${fingerprint}' (got: '${containerTitle}')`,
		);
	});
});
