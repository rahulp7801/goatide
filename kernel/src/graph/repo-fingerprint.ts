/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Phase 16 Plan 16-01 DEEP-06 phase-A — canonical 12-char fingerprint helper.
//
// Used as the canonical repoId value passed to dao.queryByRepo + (Phase 17 phase-B)
// dao.seed. Phase 17's cross-repo enumeration command calls fingerprint(remoteUrl)
// once per workspace folder.
//
// Security: never inject raw remote URL into SQL. Even with parameterized queries
// the principle of least exposure says we never carry the URL past this boundary.
// 12 hex chars = 48 bits — collision-resistant for the small N (workspace folder
// count) we care about. SHA-256 is the standard kernel-side hash (no new dep).

import { createHash } from 'node:crypto';

/**
 * Canonical 12-char hex fingerprint of a git remote URL. The URL is lowercased and
 * stripped of trailing slash + .git before hashing so https://github.com/x/y.git,
 * https://github.com/x/y/, and HTTPS://GitHub.com/x/y all hash to the same value.
 *
 * @param remoteUrl  Raw remote URL from `git remote get-url origin` (or equivalent).
 * @returns          12-char lowercase hex string, stable across re-clones.
 */
export function fingerprint(remoteUrl: string): string {
	const normalized = remoteUrl.trim().toLowerCase().replace(/\.git$/, '').replace(/\/$/, '');
	return createHash('sha256').update(normalized).digest('hex').slice(0, 12);
}
