/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// src/vs/goatide/extensions/goatide-bridge/test/integration/harvester/liveness-banner.test.ts
//
// Phase 5 Wave-0 refusal stub for TELE-06 (bridge-side LivenessBanner status-bar item;
// reflects per-source staleness via kernel.harvesterGetLiveness RPC). Plan 05-07 flips.

describe('TELE-06: LivenessBanner', () => {
	it.skip('LivenessBanner polls kernel.harvesterGetLiveness every 30s and transitions StatusBarItem to errorBackground when ANY source stale', () => {
		throw new Error('Plan 05-07 has not yet implemented LivenessBanner');
	});

	it.skip('click target opens quick-pick of stale sources', () => {
		throw new Error('Plan 05-07 has not yet implemented LivenessBanner (quick-pick action)');
	});
});
