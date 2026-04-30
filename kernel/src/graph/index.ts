/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// kernel/src/graph/index.ts — Phase 2 (Plan 02-03) public surface for the graph subsystem.
//
// Wave 3 (CLI), future kernel JSON-RPC, harvester (Phase 5), Canvas (Phase 4) — every
// caller above the SQLite layer imports from THIS file, never from `./schema/*` or
// `./db.ts` directly. The DAO is the only mutation surface; this file is the only
// import surface.

export { openDatabase, type OpenDatabaseHandle } from './db.js';
export { GraphDAO, type SeedInput, type NodeRow } from './dao.js';
export {
	NodePayloadSchema,
	ProvenanceInputSchema,
	ConstraintPayload,
	DecisionPayload,
	ContractPayload,
	OpenQuestionPayload,
	AttemptPayload,
	type NodePayload,
	type NodeKindLiteral,
	type ProvenanceInput,
} from './payloads.js';
export { hasGhostingTokens, GHOSTING_TOKENS } from './ghosting.js';
export { NODE_KINDS, type NodeKind, CONFIDENCE_VALUES, type Confidence } from './schema/nodes.js';
export { EDGE_KINDS, type EdgeKind } from './schema/edges.js';
