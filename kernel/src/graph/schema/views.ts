// kernel/src/graph/schema/views.ts — Phase 2 (Plan 02-02) active-set view.
//
// Per GRAPH-08: an `active_nodes` view returns only the active set (invalidated_at IS NULL).
// SQLite views are read-only and substituted at query time, so this is just a query
// shorthand — no separate storage cost. Time-parameterized as-of queries (GRAPH-08 second
// half) are handled by the CLI substituting a timestamp into a prepared statement, since
// SQLite views don't take parameters.
//
// Reference: 02-RESEARCH.md ## Pattern: active_at View.

import { isNull } from 'drizzle-orm';
import { sqliteView } from 'drizzle-orm/sqlite-core';
import { nodes } from './nodes.js';

export const activeNodes = sqliteView('active_nodes').as((qb) =>
	qb.select().from(nodes).where(isNull(nodes.invalidated_at))
);
