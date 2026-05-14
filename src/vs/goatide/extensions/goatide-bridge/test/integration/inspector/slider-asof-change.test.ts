/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// RED stub for Plan 15-04 - Wave-0-first integration test. GREEN-flips when Wave 3 lands
// the inspector slider <-> host RPC round-trip:
//
//   webview slider drag
//     -> inspector.requestSnapshot({asOf}) [WebviewToHost]
//     -> host calls KernelClient.queryGraphSnapshot({asOf})
//     -> host posts inspector.show({nodes, edges, truncated}) [HostToWebview]
//     -> webview re-renders with the new snapshot
//
// Wave-0 ships this file with assert.fail() so the test is discovered + reported RED.

import { describe, it } from 'mocha';
import { strict as assert } from 'node:assert';

describe('inspector slider asOf change', () => {
	it('slider drag posts new asOf -> host calls queryGraphSnapshot -> webview re-renders with new snapshot', async () => {
		// On Wave 3 GREEN-flip, this body becomes a mock-KernelClient driven full
		// host<->webview round-trip mirroring drift/intent-drift.test.ts setup. The mock
		// returns a snapshot whose first node label is keyed to the asOf parameter; the
		// assertion verifies that label appears in the rendered DOM after the slider drag
		// dispatches inspector.requestSnapshot.
		assert.fail('Wave 3 implements - Plan 15-04 GREEN-flips (full slider -> RPC -> re-render round-trip)');
	});
});
