// kernel/src/graph/schema/index.ts — Phase 2 (Plan 02-02) schema entry point.
//
// drizzle.config.ts points at this file via the `schema` field. Re-exports everything
// (tables, views, allowlist constants, type unions) from one place so:
//   1. drizzle-kit generate has a single file to read
//   2. DAO + CLI code (Waves 2 & 3) imports from `./graph/schema` not deeper paths
//   3. tests can pull NODE_KINDS, EDGE_KINDS, etc. from one place

export * from './nodes';
export * from './edges';
export * from './provenance';
export * from './views';
