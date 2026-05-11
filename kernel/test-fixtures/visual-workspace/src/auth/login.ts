/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/test-fixtures/visual-workspace/src/auth/login.ts
//
// Visual-ceremony fixture (Phase 11 Plan 11-00). Compliant baseline: `authenticateUser`
// calls `requireAuth(session)` BEFORE reading `session.userId`, so the ContractNode's
// pattern regex (function\s+authenticate\w+[^}]*\{(?![^}]*requireAuth)) does NOT match.
// The sibling login-violations.ts file removes the requireAuth() call to drive VIS-06.
//
// This file is NEVER compiled by tsc — it is loaded as a workspace file by the IDE
// fixture only. The Request/Session/User types are intentionally referenced as ambient
// shapes; no .d.ts is required because the fixture's TypeScript is opened, not built.

import { requireAuth } from './requireAuth';

interface Request {
	headers: Record<string, string>;
}

interface Session {
	userId: string | null;
}

interface User {
	id: string;
	name: string;
}

export async function authenticateUser(req: Request, session: Session): Promise<User | null> {
	requireAuth(session);
	const userId = session.userId;
	if (!userId) {
		return null;
	}
	return { id: userId, name: req.headers['x-display-name'] ?? 'unknown' };
}
