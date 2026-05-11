/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/test-fixtures/visual-workspace/src/auth/login-violations.ts
//
// Visual-ceremony fixture (Phase 11 Plan 11-00). Pattern-violating variant of login.ts:
// `authenticateUserUnsafe` reads `session.userId` WITHOUT calling requireAuth() first, so
// the ContractNode's pattern regex (function\s+authenticate\w+[^}]*\{(?![^}]*requireAuth))
// DOES match. VIS-06 (Drift Findings list) renders this file's path + line range when the
// drift detector reports the violation.
//
// Symbol name is intentionally distinct from login.ts so both files can coexist in the
// workspace without TypeScript identifier collision (even though tsc never compiles them).

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

export async function authenticateUserUnsafe(req: Request, session: Session): Promise<User | null> {
	const userId = session.userId;
	if (!userId) {
		return null;
	}
	return { id: userId, name: req.headers['x-display-name'] ?? 'unknown' };
}
