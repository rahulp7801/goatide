# ADR: Single-DB WAL Isolation for Phase 21 Cross-Repo Activation

**Status:** Accepted (2026-05-17 — Phase 21 kickoff)

---

## Context

GoatIDE's kernel daemon (`kernel/src/daemon/index.ts`) manages a SQLite graph database
(`graph.db`) whose schema was established in Phase 16 (migration 0008, adding the
`repo_id` column to nodes/edges/provenance tables). Phase 17 wired the `repo_id` field
through the graph snapshot RPC and Cytoscape edge-crossRepo styling (dormant until v2.1).
Phase 20 (`CreateDecisionNodeParams.repo_id?`) added the first forward-compat parameter
slot. Phase 21 now activates cross-repo writes by threading `repo_id` through the 4
write-RPC parameter interfaces (proposeEdit, atomicAccept, recordRejection,
recordContractOverride) and introducing the `WorkspaceRepoState` bridge module.

The key architectural question for Phase 21 is: **how many kernel daemon processes may
simultaneously readwrite-open the same `graph.db` file?**

SQLite WAL mode (already configured at `kernel/src/graph/db.ts:41` via
`PRAGMA journal_mode = WAL`) allows multiple readers + one writer per database, but this
is intra-process concurrency -- multiple SQLite connections within a single OS process.
Cross-process concurrency (two separate daemon OS processes opening the same WAL file for
writing) risks page-level corruption and partial-write interleaving that WAL cannot guard
against at the OS level.

In the Phase 21 v2.1 scope, each user has exactly one workspace active at a time and the
bridge spawns exactly one kernel daemon. Multi-workspace / multi-repo concurrency at the
daemon level is deferred to v2.2.

---

## Decision

**Single kernel daemon per user, single `graph.db`, SQLite WAL mode for intra-daemon
concurrency, dbPath-keyed startup guard for inter-daemon safety.**

Specifically:

1. **One daemon per user.** The existing lockfile mechanism (`kernel/src/daemon/lockfile.ts`)
   enforces that exactly one daemon advertises itself at a time. Phase 21 strengthens this
   by adding a `db_path` field to `LockfileContent` so the lockfile encodes which database
   the advertised daemon is serving.

2. **One `graph.db`.** All nodes, edges, and provenance rows live in a single SQLite file
   whose path is resolved at daemon startup via `fs.realpathSync(args.dbPath)`. Cross-repo
   isolation is achieved by the `repo_id` column on every table (seeded by migration 0008),
   NOT by separate database files.

3. **SQLite WAL mode.** Already configured at `kernel/src/graph/db.ts:41`. WAL handles
   intra-daemon concurrency (read transactions from RPC handlers running concurrently with
   write transactions from the JSONL harvester watcher). No new pragmas or connection
   pool changes are needed.

4. **dbPath-keyed startup guard.** `startDaemon` calls `fs.realpathSync(args.dbPath)`
   once before lockfile construction (resolves symlinks, normalizes separators). The
   resulting `canonicalDbPath` is written as `db_path` on the `LockfileContent` object.
   In the `exists` branch of `atomicCreateLockfile`, if the existing lockfile's `db_path`
   matches `canonicalDbPath` AND the PID is alive, `startDaemon` closes its newly-bound
   server socket and throws:

   ```
   startDaemon: another kernel daemon is already serving the same graph.db
   (pid=<existing.pid>, port=<existing.rpc_port>, db_path=<existing.db_path>).
   Single-DB WAL isolation: only one daemon may readwrite-open the same DB file.
   ```

5. **`repo_id` in `provenance.detail`.** Write RPCs that accept an optional `repo_id`
   parameter default to `'primary'` when the parameter is omitted. The handler writes
   `repo_id` into `provenance.detail` alongside the existing action/receipt_id fields.
   This is a provenance-layer annotation only -- the actual `repo_id` column on graph
   nodes is set at the DAO layer by the existing seed infrastructure.

---

## Consequences

### Positive

- **Zero new IPC surface.** No new RPC methods, no new inter-process protocols. The
  dbPath fence is a startup-time check only; it does not add any runtime overhead.

- **Backward-compatible kernel suite.** The `db_path` field is additive -- existing
  lockfile readers that do not check `db_path` continue to function correctly. The
  `readLockfile` validator only requires `pid`, `rpc_port`, `auth_token`, `started_at`,
  `version` to be present; `db_path` is read via optional access (`existing.db_path`)
  and the fallback path (live pid + no db_path match) still throws the existing error.

- **Phase 21 cannot accidentally corrupt the DB by forking two daemons.** The fence
  fires at startup, before any WAL writer is registered, so the window for corruption is
  zero rather than narrow.

### Negative

- **Phase 21 cannot itself seed non-'primary' `repo_id` column rows.** Cross-repo
  dogfooding in v2.1 produces rows whose `provenance.detail.repo_id` reflects the active
  workspace repo fingerprint, but the graph nodes themselves still carry `repo_id =
  'primary'` until the DAO seeding layer is updated (v2.2 milestone). Integration tests
  that want to assert on non-'primary' `repo_id` at the node level must use raw SQL to
  seed test rows directly.

- **Single-daemon SPOF deferred.** If the daemon crashes, the bridge must restart it.
  Multi-daemon failover (v2.2) would allow a second daemon to serve a fresh DB while the
  primary is restarting. This architecture defers that capability.

---

## Alternatives Considered

### a. Multi-daemon per repo (one daemon per workspace folder / repo)

**Rejected.** Would require a process-discovery registry (which daemon serves which repo?),
a new RPC multiplexer in the bridge, and per-repo lockfile namespacing. The graph schema
(repo_id column) already provides logical isolation within a single file. Multi-daemon
adds operational complexity for a concurrency scenario (truly simultaneous writes from two
repos in the same IDE session) that v2.1 dogfood testing does not require.

### b. Single daemon, multiple `graph.db` files (one per repo)

**Rejected.** Would require the daemon to manage multiple SQLite connections with separate
WAL journals, a per-connection auth channel, and cross-repo query federation (for the
Graph Inspector's unified timeline). Migration 0008 was specifically designed to colocate
all repos in one schema via `repo_id` partitioning. Splitting to multiple files would
undo that design.

### c. Multi-daemon, single `graph.db` (shared WAL across processes)

**Rejected.** SQLite WAL mode does NOT protect against concurrent writers from separate
OS processes (only concurrent readers + one writer per process). Two daemons sharing the
same WAL file would race on WAL checkpoint operations and could corrupt the database.
This option is the specific failure mode the dbPath-keyed startup guard prevents.

---

## Open Questions

- **v2.2 multi-daemon timing.** When the v2.2 milestone introduces per-repo daemons, the
  lockfile schema will need a version bump and the bridge's lockfile reader
  (`src/vs/goatide/extensions/goatide-bridge/src/kernel/lockfile-reader.ts`) will need
  to support multiple lockfile paths. The `db_path` field added in Phase 21 is forward-
  compat: it documents which DB a daemon owns without prescribing how many daemons may
  coexist.
