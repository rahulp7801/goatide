# visual-workspace — Phase 11 visual-ceremony fixture

Canonical workspace + seed driver used by every Phase 11 VIS-* assertion block. Plan 11-00
ships the scaffolding; Plans 11-01..11-04 each append assertion blocks to
`scripts/test/visual-ceremony-cdp.cjs` against this fixture's graph DB.

## Layout

```
kernel/test-fixtures/visual-workspace/
├── README.md                  — this file (## Audits below pins downstream contracts)
├── seed.sh                    — bash driver that populates a target graph DB
├── seed-payloads.json         — NodePayload literals consumed by seed.sh
├── .vscode/
│   └── settings.json          — goatide.session.priority = "Quality-First"
├── contracts/
│   └── auth-security.md       — ContractNode-anchored markdown with ATX H2 headings
└── src/
    └── auth/
        ├── login.ts           — compliant baseline (calls requireAuth before session read)
        ├── login-violations.ts — pattern-violating variant (drives VIS-06)
        └── requireAuth.ts     — stub helper imported by login.ts
```

## Invariants

1. **Pitfall 7 — ATX heading exact-match.** `contracts/auth-security.md` declares two H2
   headings `## Authentication` and `## OAuth Scopes` whose text matches the
   `enforcing_sections` array in `seed-payloads.json` byte-for-byte (no leading `##`, no
   trailing whitespace, case-exact). Renaming a section without updating the seed payload
   breaks VIS-09 section-mismatch detection. The harness automated check
   (`grep "^## Authentication$" contracts/auth-security.md`) is the canary.

2. **Pattern-violating file is a distinct symbol.** `login-violations.ts` exports
   `authenticateUserUnsafe` (not `authenticateUser`) so both files coexist in the workspace
   without TypeScript identifier collision, even though tsc never compiles fixture code.

3. **Workspace priority defaults to Quality-First** so VIS-09 sees a mismatch when VIS-10
   flips `.vscode/settings.json` to Speed-First during the ceremony run.

4. **Idempotent seed.** `seed.sh` is safe to invoke repeatedly against a fresh
   `TARGET_DB` — it does NOT delete an existing DB; callers must provision a clean target
   path (the visual-ceremony harness `mkdtemp`s a per-run target).

## Seeding

```bash
TARGET_DB=/tmp/visual-ceremony.db bash kernel/test-fixtures/visual-workspace/seed.sh
```

`seed.sh` reads each entry in `seed-payloads.json`, writes the `payload` sub-object to a
temp JSON file, then invokes:

```
node kernel/dist/cli/index.js graph seed \
  --kind <kind_alias> \
  --body <body> \
  --source visual-ceremony-fixture \
  --actor fixture-seed \
  --db $TARGET_DB \
  --payload-json <temp-payload.json>
```

After all node seeds succeed, `seed.sh` writes a `references` edge from the
DecisionNode (anchor `src/auth/login.ts`) to the ContractNode via direct
`dao.writeEdge({ kind: 'references', ... })` invocation. The `references` kind is one
of the five allowlisted edge kinds in `kernel/src/graph/schema/edges.ts`.

## Audits

Resolutions for the four open questions flagged by 11-RESEARCH.md. Each resolution
documents the audit finding, the chosen path, and the rationale.

### Open Q 1 — `goatide-cli graph seed --payload-json` flag

**Finding.** Pre-Plan-11-00 the `seed` subcommand (kernel/src/cli/commands/seed.ts) only
accepted `--kind` + `--body` + `--source` + `--actor` + `--db`. It built `payload = {kind,
body}` and passed it through `dao.seed`. There was NO mechanism to flow the optional
structured fields on `ContractPayload` (patterns[], enforcing_sections[], contract_path),
`DecisionPayload` (derived_under_priority, anchor), or any other payload-discriminator-
specific field into the seeded node.

**Resolution path (chosen).** Extended the CLI with a `--payload-json <path>` flag. The
flag reads a JSON object from disk, merges its fields into the constructed payload
BEFORE Zod validation, and lets `--kind` (always wins) + `--body` (always wins) override
any same-name fields in the JSON. The CLI is the source-of-truth for kind canonicalization
(via `resolveKindAlias`), and the body is rejected at the CLI boundary if it contains
Ghosting tokens — both invariants preserved.

**Rationale.** Merging structured fields via JSON is the minimal-surface extension: zero
back-compat risk (Phase 2..7 invocations passing only `--kind`+`--body` behave identically
because `extras` defaults to `{}`), and adding a new `--patterns` / `--enforcing-sections`
flag pair for every optional field would balloon the CLI surface and require a new flag
each time a payload kind gained an optional field. The `--payload-json` mechanism scales
naturally to the four `*Payload` variants in `kernel/src/graph/payloads.ts`.

**Code change.** `kernel/src/cli/commands/seed.ts` — added `readFileSync` import,
`payloadJson?` field on `SeedOptions`, `--payload-json <path>` commander option, and a
JSON-parse + object-validation step that builds `extras` before the payload spread.
Invalid JSON / non-object payloads exit non-zero through `formatError`.

### Open Q 2 — `references` edge for VIS-09 file-anchor → DecisionNode citation

**Finding.** VIS-09 (Plan 11-03) needs the citation cone from `src/auth/login.ts` to
surface the seeded DecisionNode so the priority-mismatch indicator can render. Two
candidate paths:

- (a) Add an `edge` or `references` CLI subcommand. Searched
  `kernel/src/cli/commands/` — no such subcommand exists, and Phase-2/3 design
  intentionally kept edge writes out of the CLI surface (edges are internal to seed +
  supersede atomic transactions).

- (b) Seed the DecisionNode with `anchor: { file: 'src/auth/login.ts', ... }` and rely
  on Phase-3 traversal to pick up the edge-traversal cone. Confirmed `anchor` is a
  Phase-2 schema field (`kernel/src/graph/payloads.ts:29-35`).

- (c) Invoke `dao.writeEdge` directly from bash via `node -e`. The DAO surface is
  exported through `kernel/src/graph/index.ts`, and `WriteEdgeInput` accepts
  `{ kind, src_id, dst_id }` with `kind ∈ {parent_of, references, supersedes,
  derived_from, protects}`.

**Resolution path (chosen).** Combined (b) and (c). The DecisionNode is seeded with
`anchor: { file: 'src/auth/login.ts', line: 30 }` so Phase-3 anchor-resolution finds
it via file-path lookup, AND `seed.sh` writes an explicit `references` edge from the
DecisionNode to the ContractNode after both ULIDs are captured from the seed CLI's
stdout. The edge write uses `dao.writeEdge({ kind: 'references', src_id: <decisionId>,
dst_id: <contractId> })` invoked via `node -e` against the same `$TARGET_DB`.

**Rationale.** Direct `dao.writeEdge` from bash is the path of least surface — no new
CLI subcommand is needed for v1 fixture seeding, the DAO's transactional invariants
(append-only, CHECK-trigger validated) are preserved, and the edge is explicit (not
inferred from anchor proximity) so VIS-09's assertion has a deterministic ULID pair to
target. Adding a `graph edge` CLI subcommand was rejected because it would expand the
public surface for a single fixture's use case; if Phase 12+ needs edge writes from
external tools, the CLI extension can land then with proper schema validation.

### Open Q 3 — MCP schema-drift state mechanism (reactive vs disk-persisted)

**Finding.** Investigated `kernel/src/mcp/schema-drift/{detector.ts, snapshot.ts,
paths.ts}` + `kernel/src/mcp/clients/pool.ts`.

The schema-drift system is **disk-persisted** for the per-tool hash snapshot AND
**reactive (in-memory transient)** for the `paused_drift` provider state. Specifically:

1. **Disk-persisted baseline.** `snapshotAndDetectDrift` writes a JSON snapshot to
   `%APPDATA%/goatide/mcp/schema-snapshots/<provider>.json` (Windows) or
   `$XDG_CONFIG_HOME/goatide/mcp/schema-snapshots/<provider>.json` (POSIX). The snapshot
   contains canonical SHA-256 hashes of each tool's input + output schemas. First-ever
   connect writes the baseline and returns `changed=false` (Pitfall 5 — no false flag on
   cold start).

2. **Reactive provider state.** On subsequent connect, `snapshotAndDetectDrift` compares
   the live `client.listTools()` result against the persisted snapshot. If hashes differ,
   the pool transitions that provider's in-memory state to `paused_drift` and does NOT
   register the tools — `acceptProviderSchemaDrift(newSnapshot)` (called by the bridge's
   `mcp.acceptProviderSchemaDrift` RPC) overwrites the disk baseline and unblocks the
   restart loop.

**Resolution path for VIS-05 (Plan 11-04).** To drive the SchemaDriftBanner Canvas alert,
the fixture must either:

- **Path A (disk-write the future-state baseline).** Pre-write
  `%APPDATA%/goatide/mcp/schema-snapshots/<provider>.json` with a STALE hash (matching no
  current tool schema), then connect a mock provider — the detector compares live tools
  against the stale baseline, finds drift, and the pool transitions to `paused_drift`.

- **Path B (runtime re-spawn with different tools-list).** Connect a mock provider once
  (which writes the baseline), then re-spawn the same mock with a different `--mode` that
  returns a different tools-list — the second connect's detector finds drift against the
  just-written baseline.

**Chosen for VIS-05.** Plan 11-04 will use **Path A** because it is deterministic and
does NOT require a mock-provider double-spawn (which on Windows would race on stdio child
shutdown). The fixture pre-stages a snapshot file pointing to a tool name + hash that the
v1 mock fixtures never emit, so the first ceremony-run connect deterministically reports
drift.

**Rationale.** Path A is hermetic — no live MCP server is required during the ceremony
run, only the disk artifact. The fixture writes the pre-staged snapshot to a per-run temp
directory via a `--mcp-schema-snapshot` env override (to be added in Plan 11-04 if not
already present) so the production user's `~/.config/goatide/mcp/schema-snapshots/` is
never touched.

### Open Q 4 — `GOATIDE_LIVENESS_THRESHOLD_MS` env-var override

**Finding.** `kernel/src/harvester/liveness.ts:113` exports
`resolveLivenessThresholdsFromEnv(env)` which reads
`GOATIDE_LIVENESS_<SOURCE_UPPERCASE>_MS` for each source in `DEFAULT_LIVENESS_THRESHOLDS`
and overrides invalid values silently. The current sources are
`claude_jsonl`, `editor_save`, `terminal_shell`, `git_commit`, `mcp_external_signal` —
each independently overridable.

**Resolution.** No code change required. VIS-04 (Plan 11-04) can set
`GOATIDE_LIVENESS_EDITOR_SAVE_MS=5000` in the harness `env:` block to flip the editor-save
threshold to 5 seconds during the ceremony run. The daemon constructs the threshold map
from env on bootstrap, so the override propagates without code-level patches.

**Rationale.** The env-override mechanism is already production-grade — invalid values
are silently rejected (defense-in-depth so a typo doesn't disable the watchdog), and the
mechanism scales across all five observation sources. The plan author flagged this as a
question because the existence of the override was not documented in
11-RESEARCH.md; this README pins the answer for downstream VIS-04 use.

## Per-VIS-* Mapping

The visual-ceremony harness drives 10 VIS-* surfaces across Waves 1-4. The fixture's
files map as follows:

| VIS-* | Wave | Surface                                | Fixture files consumed                                          |
| ----- | ---- | -------------------------------------- | --------------------------------------------------------------- |
| VIS-01 | 1   | Verification Canvas reveal             | `src/auth/login.ts` (save trigger), graph DB                    |
| VIS-09 | 1   | Priority-mismatch indicator            | DecisionNode (priority=Quality-First) + `.vscode/settings.json` |
| VIS-10 | 1   | Set Session Priority quickPick         | `.vscode/settings.json` (flips to Speed-First)                  |
| VIS-02 | 2   | Cancel-then-redo destructive prompt    | `src/auth/login.ts` (save with synthesized diff)                |
| VIS-03 | 2   | Save-bypass modal                      | `src/auth/login.ts` (forced bypass path)                        |
| VIS-06 | 3   | Drift Findings list                    | `src/auth/login-violations.ts` + ContractNode patterns          |
| VIS-07 | 3   | Override flow modal                    | Drift finding from VIS-06 + override action                     |
| VIS-08 | 3   | Compliance report                      | ContractNode + Phase-7 retrieval                                |
| VIS-04 | 4   | Stale-source liveness banner           | `GOATIDE_LIVENESS_EDITOR_SAVE_MS=5000` env override             |
| VIS-05 | 4   | SchemaDriftBanner Canvas alert         | Pre-staged MCP snapshot (Open Q 3 Path A)                       |

The Wave-0 smoke assertion (`WAVE0-SMOKE`) drives `iframe.webview.ready >
iframe#active-frame > body` to prove the two-level webview traversal selector works on
this Electron build; it consumes `src/auth/login.ts` as the save-trigger target.
