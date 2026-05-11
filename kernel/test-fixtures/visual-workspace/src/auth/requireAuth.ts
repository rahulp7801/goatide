/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/test-fixtures/visual-workspace/src/auth/requireAuth.ts
//
// Stub helper imported by login.ts. The fixture is never tsc-compiled, but having the file
// present means the IDE's TypeScript language service shows zero red squigglies on open —
// the renderer screenshots produced by visual-ceremony harness are clean.

interface Session {
	userId: string | null;
}

export function requireAuth(session: Session): void {
	if (!session.userId) {
		throw new Error('Authentication required');
	}
}
