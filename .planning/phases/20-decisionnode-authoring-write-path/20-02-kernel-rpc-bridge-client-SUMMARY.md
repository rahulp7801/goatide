---
phase: 20-decisionnode-authoring-write-path
plan: 02
subsystem: kernel-rpc
tags: [vscode-jsonrpc, drizzle, sqlite, kernel-bridge, authoring, decision-node, mandate-b, AUTH-01]

# Dependency graph
requires:
  - phase: 20
    provides: "Plan 20-01 Mandate B BANNED extension (createDecisionNode added to refuse-deep05-write.sh) — landed in commit 454080f2eb8 before this plan"
  - phase: 4
    provides: "vscode-jsonrpc 8.2.1 bridge ↔ kernel transport (graph.* RPC namespace established Phase 4)"
  - phase: 2
    provides: "GraphDAO.seed + DecisionPayload Zod schema (kernel/src/graph/payloads.ts:83 DecisionPayload accepts kind/body/anchor/derived_under_priority/cite_eligible/detail)"
provides:
  - "graph.createDecisionNode kernel RPC — typed JSON-RPC RequestType + connection.onRequest handler under requireAuth wrapper"
  - "KernelClient.createDecisionNode bridge method — Promise-returning wrapper that round-trips CreateDecisionNodeParams over the established 8.2.1 transport"
  - "Bridge mirror of CreateDecisionNodeRequest wire types (src/vs/goatide/extensions/goatide-bridge/src/kernel/methods.ts) — byte-equal wire-name 'graph.createDecisionNode' to kernel side"
  - "Wave-0 RED stub kernel/src/test/rpc/createDecisionNode.spec.ts committed and flipped GREEN (was uncommitted-on-disk Plan 20-01 deliverable)"
affects:
  - "Plan 20-03 (canvas/authoring-flow.ts) — the SOLE production caller of KernelClient.createDecisionNode; will showInputBox with opts.value === '' to enforce Mandate A"
  - "Plan 20-04 (post-hoc reject button) — orthogonal but shares the same KernelClient surface"
  - "Plan 20-05 (Phase 20 closure verification) — phase-VERIFICATION harness will assert KernelClient.prototype.createDecisionNode is defined"

# Tech tracking
tech-stack:
  added: []  # no new dependencies — reuses vscode-jsonrpc 8.2.1, drizzle-orm 0.45.2, zod
  patterns:
    - "Single-tx write RPC mirroring RecordContractOverrideRequest handler shape (kernel/src/rpc/server.ts:397-448) without the edge-write step (Phase 20 OQ#3 scope-cut: constraint-link picker deferred to v2.2)"
    - "repo_id ride-along in provenance.detail (NOT payload.anchor) — Phase 21 XREPO-01 forward-compat default 'primary'"
    - "Mandate A boundary check at handler entry: !body || body.trim().length === 0 throws (defense-in-depth against bridge-side showInputBox enforcement)"
    - "Mandate B fence-before-surface — refuse-deep05-write.sh BANNED array extended before the symbol existed (commit 454080f2eb8), so the moment 'createDecisionNode' lands in an inspector/ .ts file the CI gate fires"

key-files:
  created:
    - "kernel/src/test/rpc/createDecisionNode.spec.ts (Wave-0 RED stub from Plan 20-01, now GREEN)"
  modified:
    - "kernel/src/rpc/methods.ts (+38 lines: CreateDecisionNodeParams/Result interfaces + RequestType declaration)"
    - "kernel/src/rpc/server.ts (+56 lines: imports + onRequest handler under requireAuth)"
    - "src/vs/goatide/extensions/goatide-bridge/src/kernel/methods.ts (+33 lines: bridge mirror of wire types)"
    - "src/vs/goatide/extensions/goatide-bridge/src/kernel/client.ts (+16 lines: imports + KernelClient.createDecisionNode method)"

key-decisions:
  - "Handler is synchronous (not async) — matches RecordContractOverrideRequest sibling shape; dao.seed is sync (better-sqlite3 + drizzle-orm sync API). No await needed."
  - "Boundary validation: empty/whitespace body throws; anchor must include at least one of file|symbol|ticket_id. Mandate A defense-in-depth against future regression of the bridge-side showInputBox.value === '' enforcement."
  - "repo_id rides in provenance.detail, NOT payload.anchor. Rationale: payload.anchor is the per-file/symbol pointer that drives anchor resolution at query time; repo_id is a workspace-level scoping concern that belongs in provenance bookkeeping. Phase 21 XREPO-01 forward-compat default 'primary'."
  - "NO edge write in the handler — Phase 20 OQ#3 scope-cut. The plan's must_haves explicitly call out 'no business logic beyond Zod payload validation + provenance attachment'. Constraint-link picker UI deferred to v2.2; standalone DecisionNodes can be wired to ConstraintNodes by Phase 21+ tooling."

patterns-established:
  - "Pattern: handler mirrors closest sibling write-RPC shape (RecordContractOverrideRequest at server.ts:397-448) minus the orthogonal concerns (no metrics increment, no edge write). Lifts the cognitive load when adding future write RPCs."
  - "Pattern: bridge KernelClient method is a one-liner this.sendWithTimeout call — KernelClient is intentionally a thin transport adapter; business logic + validation lives kernel-side."
  - "Pattern: dist/ build artifacts are gitignored; ONLY the source-of-truth .ts files are committed. Mirror sync via prepare_goatide.sh rebuilds extensions/goatide-bridge/dist from src/vs/goatide/extensions/goatide-bridge/dist."

requirements-completed:
  - AUTH-01

# Metrics
duration: ~17 min
completed: 2026-05-18
---

# Phase 20 Plan 02: Kernel RPC + Bridge Client Summary

**Lands `graph.createDecisionNode` kernel RPC + `KernelClient.createDecisionNode` bridge method — the lowest-layer write path for the new DecisionNode authoring surface (Mandate B fence-before-surface intact, Mandate A boundary check defense-in-depth at handler entry).**

## Performance

- **Duration:** ~17 min (wall-clock execution; excluding the ~3 long-running test invocations)
- **Started:** 2026-05-18T01:40:00Z (approx)
- **Completed:** 2026-05-18T01:57:00Z
- **Tasks:** 2 (Task 20-02-01 kernel, Task 20-02-02 bridge)
- **Files modified:** 4 source files + 1 newly-tracked test stub (total +143 lines across kernel + bridge source-of-truth)

## Accomplishments

- **New kernel RPC `graph.createDecisionNode`** — typed `RequestType<CreateDecisionNodeParams, CreateDecisionNodeResult, Error>`. Single-tx dao.seed call + provenance attachment. Returns `{node_id}` after a boundary-validated DecisionPayload writes through the GraphDAO.
- **New bridge `KernelClient.createDecisionNode` method** — single `sendWithTimeout` call, mirrors the `recordContractOverride` pattern verbatim. KernelClient is a thin transport adapter; validation + business logic live kernel-side.
- **Bridge mirror types shipped** — `src/vs/goatide/extensions/goatide-bridge/src/kernel/methods.ts` carries the byte-equal `RequestType('graph.createDecisionNode')` declaration (Pitfall 5: wire-name byte-equality with kernel side).
- **Wave-0 RED stub flipped GREEN** — `kernel/src/test/rpc/createDecisionNode.spec.ts` was authored by Plan 20-01 but uncommitted-on-disk. Tracked here, now PASSES (paired Duplex MessageConnection round-trip persists a queryable DecisionNode).
- **Mandate B fence holds** — `refuse-deep05-write.sh` exit 0 (12 inspector/ files scanned; no `createDecisionNode` token in any). `refuse-deep05-write.meta.sh` `META PASS` with positive control fired on Phase 3 fixture (banned `createDecisionNode` token).

## Task Commits

Each task committed atomically:

1. **Task 20-02-01: Kernel RPC + handler + RED stub flip** — `6768e7985d5` (feat)
   - kernel/src/rpc/methods.ts +38 lines (`CreateDecisionNodeRequest` + interfaces)
   - kernel/src/rpc/server.ts +56 lines (import + `connection.onRequest` handler)
   - kernel/src/test/rpc/createDecisionNode.spec.ts NEW (Plan 20-01 stub tracked)

2. **Task 20-02-02: Bridge mirror + KernelClient method + mirror sync** — `3e7198ca2bd` (feat)
   - src/vs/goatide/extensions/goatide-bridge/src/kernel/methods.ts +33 lines (bridge mirror)
   - src/vs/goatide/extensions/goatide-bridge/src/kernel/client.ts +16 lines (imports + method)

_Note: dist/ outputs are gitignored; mirror sync via `prepare_goatide.sh` rebuilds them from source at packaging time. The plan frontmatter's `files_modified` claim of `extensions/goatide-bridge/out/kernel/methods.js` was inaccurate — actual layout is `extensions/goatide-bridge/dist/kernel/methods.js` (gitignored)._

## Files Created/Modified

- `kernel/src/rpc/methods.ts` — Adds `CreateDecisionNodeParams` (body + anchor + derived_under_priority? + repo_id?) + `CreateDecisionNodeResult` ({node_id}) + `CreateDecisionNodeRequest = new RequestType<...>('graph.createDecisionNode')`. Placed after `RecordContractOverrideRequest` for thematic grouping.
- `kernel/src/rpc/server.ts` — Adds imports of `CreateDecisionNodeRequest` + `type CreateDecisionNodeResult` and `connection.onRequest(CreateDecisionNodeRequest, requireAuth(...))` handler. Validates body is non-empty trimmed (Mandate A boundary defense-in-depth) + anchor includes at least one of file|symbol|ticket_id, then `dao.seed` with `payload: {kind:'DecisionNode', body, anchor, derived_under_priority, cite_eligible:true, detail:{}}` + `provenance: {source:'canvas', actor:'developer', detail:{action:'create_decision_node', via:'authoring-flow', repo_id: params.repo_id ?? 'primary'}}`.
- `kernel/src/test/rpc/createDecisionNode.spec.ts` — Plan 20-01 Wave-0 RED stub committed here (was uncommitted-on-disk). Paired Duplex MessageConnection round-trip: dynamic import of `CreateDecisionNodeRequest` succeeds; `client.sendRequest` returns `{node_id}`; `dao.queryById(node_id)` confirms a `DecisionNode` with the requested body.
- `src/vs/goatide/extensions/goatide-bridge/src/kernel/methods.ts` — Adds bridge mirror of the wire types + `CreateDecisionNodeRequest` declaration. Same wire name `'graph.createDecisionNode'` byte-for-byte.
- `src/vs/goatide/extensions/goatide-bridge/src/kernel/client.ts` — Adds imports of the new types/RequestType + `createDecisionNode(params): Promise<CreateDecisionNodeResult>` method on `KernelClient` class. Single `this.sendWithTimeout(CreateDecisionNodeRequest, params)` call.

## Decisions Made

1. **Handler is synchronous (NOT async).** Mirrors `RecordContractOverrideRequest` sibling shape. `dao.seed` is sync (better-sqlite3 + drizzle-orm both use sync transactions). No `await` needed.

2. **Mandate A boundary check at handler entry.** Even though the bridge-side `showInputBox.value === ''` enforcement is the primary fence (Plan 20-03), the kernel handler defensively throws on empty/whitespace body. Defense-in-depth — a future regression of the bridge fence would be caught at the kernel boundary instead of producing a `DecisionNode` with empty `body` (which the `Body` Zod schema would also reject, but the explicit handler check produces a friendlier error).

3. **repo_id rides in provenance.detail, NOT payload.anchor.** Payload.anchor is the per-file/symbol pointer that `resolveAnchor` uses at query time; repo_id is workspace-level scoping that belongs in provenance bookkeeping. The provenance.detail field is `z.record(z.string(), z.unknown()).optional()` so the extra key is structurally accepted. Phase 21 XREPO-01 forward-compat default `'primary'`.

4. **NO edge write in the handler.** Phase 20 OQ#3 scope-cut. The constraint-link picker UI (which would let the user select 1+ ConstraintNodes the new DecisionNode `derived_from`) is deferred to v2.2. Standalone DecisionNodes can be wired to ConstraintNodes by Phase 21+ tooling — the bitemporal model permits late edge insertion at any valid_from.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Tracked Plan 20-01 Wave-0 RED stub `kernel/src/test/rpc/createDecisionNode.spec.ts`**
- **Found during:** Task 20-02-01 verification step (search for the stub to assert RED→GREEN flip)
- **Issue:** Plan 20-02's `must_haves.truths` says the Wave-0 RED stub flips GREEN. The stub existed on-disk (untracked file from Plan 20-01 work) but was never committed. To make the GREEN assertion reproducible across clean clones, the stub had to be tracked.
- **Fix:** Added `kernel/src/test/rpc/createDecisionNode.spec.ts` to the Task 20-02-01 commit (`6768e7985d5`). The stub was authored by Plan 20-01 (Wave-0 RED test contract); Plan 20-02 (Wave-1 implementation) is now the commit that introduces it because Plan 20-01 itself never produced a SUMMARY/closing commit for its Wave-0 test artifacts.
- **Files modified:** kernel/src/test/rpc/createDecisionNode.spec.ts (NEW, +112 lines)
- **Verification:** `npm test -- -t "createDecisionNode"` reports `1 passed | 408 skipped` — the new test is discovered and passes.
- **Committed in:** `6768e7985d5` (Task 20-02-01 commit)

**2. [Rule 3 - Blocking] Plan 20-02 frontmatter `files_modified` listed wrong mirror paths**
- **Found during:** Task 20-02-02 Step 7 (mirror sync verification)
- **Issue:** Plan frontmatter listed `extensions/goatide-bridge/out/kernel/methods.js` + `out/kernel/client.js` as "files_modified". The actual bridge build layout uses `dist/` (not `out/`); the bridge ships as a CommonJS extension with `main: "./dist/extension.js"` and tsc emits other compiled JS to `dist/kernel/methods.js` + `dist/kernel/client.js`. `dist/` is gitignored.
- **Fix:** Followed the actual layout — verified `createDecisionNode` token is present in `src/vs/goatide/extensions/goatide-bridge/dist/kernel/methods.js` (post-`npm run build`) and in `extensions/goatide-bridge/dist/kernel/methods.js` (post-`prepare_goatide.sh`). Documented the path correction in this SUMMARY.
- **Files modified:** None (the build outputs land at the correct paths automatically; the plan documentation was inaccurate)
- **Verification:** `refuse-stale-bridge-mirror.sh` exit 0; `grep -c "createDecisionNode"` returns >=1 in the mirror's `dist/kernel/methods.js` + `dist/kernel/client.js`.

---

**Total deviations:** 2 auto-fixed (2 blocking)
**Impact on plan:** Plan executed exactly as the must_haves require; the deviations cleaned up doc-quality issues (uncommitted stub tracking + plan path inaccuracy) without altering the substance of what shipped. No scope creep.

## Issues Encountered

- **Pre-existing kernel test failure transiently observed:** First `npm test` run reported 407 PASS + 1 FAIL (`dao-repo-id.spec.ts > queryAsOf rows carry repo_id="primary"`). Repeated runs (including the final verification run) returned 409 PASS / 0 FAIL. The failure was a flaky initialization race in the dao-repo-id test fixture (unrelated to my changes; pre-existed at HEAD~2). No remediation needed.
- **Bridge suite 16 pre-existing failing tests:** 125 passing, 16 failing on the bridge mocha suite. Failure surfaces are Phase 7 drift-flow (×6), POLISH-01 walkthrough completion (×1), CANV-01 Canvas React UI (×4), DriftFindings constraint.lift button (×2), HypotheticalImpact React component (×3). I confirmed all 16 are pre-existing by stashing my edits and re-running — same 125/16 split. None reference `createDecisionNode` or the new RPC. Logged here for visibility; out-of-scope for Plan 20-02.

## User Setup Required

None — no external service configuration required. The new RPC is internal to the bridge ↔ kernel transport.

## Next Phase Readiness

- **Ready for Plan 20-03 (canvas/authoring-flow.ts):** The kernel write path is live. Plan 20-03 will land the `canvas/authoring-flow.ts` host-side module that calls `kernelClient.createDecisionNode(...)` from a context-menu / command. It must enforce Mandate A by passing `opts.value === ''` to `vscode.window.showInputBox()` for the rationale prompt.
- **Ready for Plan 20-04 (post-hoc Reject button in `dispatchHover`):** Orthogonal to AUTH-01; uses the existing `kernel.recordRejection` RPC. The 16 pre-existing failing bridge tests are not regressions from Plan 20-02 and do not block Plan 20-04.
- **Mandate B fence is live:** The moment any contributor adds the literal `createDecisionNode` token to a file under `src/vs/goatide/extensions/goatide-bridge/src/inspector/`, `refuse-deep05-write.sh` exits 1 + the meta-test's positive control fires. The AUTH-04 architectural decision (read-only inspector layer cannot author DecisionNodes) is structurally enforced.

---
*Phase: 20-decisionnode-authoring-write-path*
*Completed: 2026-05-18*

## Self-Check: PASSED

- All 5 claimed source files present on disk
- Both task commits present in git history (`6768e7985d5`, `3e7198ca2bd`)
- `createDecisionNode` token present in all 4 source-of-truth .ts files (kernel/src/rpc/methods.ts, kernel/src/rpc/server.ts, bridge src/kernel/methods.ts, bridge src/kernel/client.ts)
- Mandate B fence (`refuse-deep05-write.sh`) exit 0; meta-test `META PASS` (positive control fired)
- Bridge mirror gate (`refuse-stale-bridge-mirror.sh`) exit 0
- Kernel suite full run: 409/409 PASS (Wave-0 RED stub flipped GREEN, no regressions)
- Project-wide `npm run compile-check-ts-native` GREEN
