/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/test/drift/lock-detector.spec.ts — Phase 7 (Plan 07-03) DRIFT-03 lock detector.
//
// Tests that detectsContractLock() correctly identifies diffs which overlap an
// enforcing-section line range of a registered ContractNode.
//
// Pinned invariants (per ROADMAP SC #3 + Open Question #5):
//   - Cosmetic-pass-silent: a diff to a non-enforcing section returns null.
//   - Nested-child edit fires parent lock: an edit to ### Tokens (under ## Authentication
//     where 'Authentication' is in enforcing_sections) returns LockTrigger with
//     section_name='Authentication' (the parent's name).
//   - Parallel-fires-with-destructive-detector: a diff that BOTH violates a destructive
//     pattern (Phase 4 detectDestructive) AND edits an enforcing section produces a non-null
//     LockTrigger AND a true detectDestructive result. The two detectors are independent
//     and orthogonal — Plan 07-07 wires both into the bridge save-gate.
//
// Plan 07-01 staged 4 it.skip stubs; Plan 07-03 flips them + adds 1 new (parallel-fires).

import { describe, it, expect } from 'vitest';
import { detectsContractLock } from '../../drift/lock-detector.js';
import type { ContractRegistry, ContractNodeRecord } from '../../drift/types.js';
import { ContractPayload } from '../../graph/payloads.js';
import { detectDestructive } from '../../canvas/destructive.js';
import type { z } from 'zod';

type ContractPayloadT = z.infer<typeof ContractPayload>;

// ----- Fixtures -----------------------------------------------------------

const API_SECURITY_BODY = [
	'# API Security Contract',                                // 1
	'',                                                       // 2
	'## Authentication',                                      // 3
	'',                                                       // 4
	'All routes MUST call requireAuth() before business logic.', // 5
	'',                                                       // 6
	'## OAuth Scopes',                                        // 7
	'',                                                       // 8
	'Routes use openid + profile + email at minimum.',         // 9
	'',                                                       // 10
	'## Notes',                                               // 11
	'',                                                       // 12
	'Cosmetic edits in this section pass silently.',          // 13
].join('\n');

const NESTED_BODY = [
	'# Auth Contract',          // 1
	'',                          // 2
	'## Authentication',         // 3
	'',                          // 4
	'Top-level rules.',          // 5
	'',                          // 6
	'### Token Validation',      // 7
	'',                          // 8
	'Token rules nested under Authentication.', // 9
	'',                          // 10
	'## Notes',                  // 11
	'',                          // 12
	'Cosmetic.',                 // 13
].join('\n');

function makeContractRecord(id: string, contractPath: string, body: string, enforcingSections: string[]): ContractNodeRecord {
	const payload: ContractPayloadT = ContractPayload.parse({
		kind: 'ContractNode',
		body,
		anchor: { file: contractPath },
		contract_path: contractPath,
		enforcing_sections: enforcingSections,
	});
	return { id, payload };
}

function makeRegistry(records: ContractNodeRecord[]): ContractRegistry {
	const byPath = new Map<string, ContractNodeRecord>();
	const byId = new Map<string, ContractNodeRecord>();
	for (const rec of records) {
		const cp = rec.payload.contract_path;
		if (cp) {
			byPath.set(cp, rec);
		}
		byId.set(rec.id, rec);
	}
	return {
		byPath,
		byId,
		// allPatterns is unused by lock-detector but the shape is part of the contract.
		allPatterns: [],
	};
}

/**
 * Build a unified diff that edits the given file at a specific line range.
 * `newStart` + `newLines` together describe the hunk's new-file line range; the body
 * payload is N `+ ...` lines (one per newLines) so the parsed hunk's lines array has the
 * correct count.
 */
function makeUnifiedDiff(filePath: string, newStart: number, newLines: number, contentPrefix: string = 'edited content'): string {
	const lines: string[] = [];
	lines.push(`--- a/${filePath}`);
	lines.push(`+++ b/${filePath}`);
	lines.push(`@@ -${newStart},${newLines} +${newStart},${newLines} @@`);
	for (let i = 0; i < newLines; i++) {
		lines.push(`+${contentPrefix} line ${newStart + i}`);
	}
	return lines.join('\n') + '\n';
}

// ----- Tests --------------------------------------------------------------

describe('drift/lock-detector — Plan 07-03 (DRIFT-03)', () => {
	it('returns null when file is not a registered contract path', () => {
		const registry = makeRegistry([
			makeContractRecord('01HZZZAPISECURITY', '/contracts/api_security.md', API_SECURITY_BODY, ['Authentication']),
		]);
		const diff = makeUnifiedDiff('src/some/random/file.ts', 10, 5);
		const trigger = detectsContractLock({ diff, contractRegistry: registry });
		expect(trigger).toBeNull();
	});

	it('returns null for cosmetic-only edit (non-enforcing section overlap) — SC #3 pin', () => {
		// Edit lines 12-13 — inside ## Notes (non-enforcing). enforcing_sections list does
		// NOT include 'Notes', so the lock does NOT fire.
		const registry = makeRegistry([
			makeContractRecord('01HZZZAPISECURITY', '/contracts/api_security.md', API_SECURITY_BODY, ['Authentication', 'OAuth Scopes']),
		]);
		const diff = makeUnifiedDiff('/contracts/api_security.md', 12, 2);
		const trigger = detectsContractLock({ diff, contractRegistry: registry });
		expect(trigger).toBeNull();
	});

	it('returns LockTrigger when hunk overlaps enforcing section', () => {
		// Edit lines 4-5 — inside ## Authentication (line 3, body lines 4-6).
		const registry = makeRegistry([
			makeContractRecord('01HZZZAPISECURITY', '/contracts/api_security.md', API_SECURITY_BODY, ['Authentication']),
		]);
		const diff = makeUnifiedDiff('/contracts/api_security.md', 4, 2);
		const trigger = detectsContractLock({ diff, contractRegistry: registry });
		expect(trigger).not.toBeNull();
		expect(trigger).toMatchObject({
			contract_node_id: '01HZZZAPISECURITY',
			contract_anchor_file: '/contracts/api_security.md',
			section_name: 'Authentication',
			edited_line_range: [4, 5],
			hunk_index: 0,
		});
	});

	it('nested-child edit fires parent lock (Open Question #5)', () => {
		// enforcing_sections = ['Authentication']. Edit lines 8-9 (inside ### Token Validation,
		// which is nested under ## Authentication). The parent's range encompasses the child's
		// lines, so the lock fires with section_name='Authentication' (the parent name).
		const registry = makeRegistry([
			makeContractRecord('01HZZZAUTH', '/contracts/auth.md', NESTED_BODY, ['Authentication']),
		]);
		const diff = makeUnifiedDiff('/contracts/auth.md', 8, 2);
		const trigger = detectsContractLock({ diff, contractRegistry: registry });
		expect(trigger).not.toBeNull();
		expect(trigger!.section_name).toBe('Authentication');
	});

	it('lock fires alongside destructive detector for destructive enforcing-section edits — DRIFT-01/03 orthogonality pin', () => {
		// PARALLEL-FIRES PIN: the diff edits an enforcing section AND contains a destructive
		// SQL `DROP TABLE` operation. detectsContractLock must return non-null AND
		// detectDestructive (Phase-4 substrate) must return true. The two detectors are
		// independent and orthogonal — Plan 07-07 wires both into the bridge save-gate.
		const registry = makeRegistry([
			makeContractRecord('01HZZZAPISECURITY', '/contracts/api_security.md', API_SECURITY_BODY, ['Authentication']),
		]);
		// Build a diff that includes a `DROP TABLE` line in the body to trigger the destructive
		// regex AND falls inside the Authentication line range (lines 4-5).
		const filePath = '/contracts/api_security.md';
		const diff = [
			`--- a/${filePath}`,
			`+++ b/${filePath}`,
			'@@ -4,2 +4,2 @@',
			'+DROP TABLE users;',
			'+other edited line',
			'',
		].join('\n');

		const trigger = detectsContractLock({ diff, contractRegistry: registry });
		expect(trigger).not.toBeNull();
		expect(trigger!.section_name).toBe('Authentication');

		// Phase-4 destructive detector independently fires on the same diff.
		expect(detectDestructive(diff)).toBe(true);
	});
});
