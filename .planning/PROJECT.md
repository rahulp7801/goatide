# GoatIDE

## What This Is

A VS Code fork (pinned to `microsoft/vscode @ 1.117.0`) that pairs every save with a graph-anchored **reasoning receipt** — explicit DecisionNodes and ConstraintNodes that record *why* a change exists. A local kernel sidecar (`kernel/`) maintains a bitemporal SQLite graph; a bridge extension (`goatide-bridge`) drives the Verification Canvas, Graph Inspector, and save-gate UX. Built for a single developer who wants the IDE itself to remember intent, not just code.

## Core Value

**Every save produces a tier-classified receipt anchored to explicit graph rationale — no LLM-generated explanations in the receipt path (Mandate A).** If everything else fails, this must work: receipts must compose from real graph citations, destructive saves must always require confirmation (Mandate D), and the inspector must never write back through any read-only client (Mandate B).

## Requirements

### Validated

<!-- Shipped and confirmed working in prior milestones. -->

**v1.0 — Fork + Graph Substrate** (phases 01, 02)
- ✓ Pinned VS Code fork with branding, CI refusal gates, LFS push-ability, cross-platform smoke
- ✓ Bitemporal graph kernel: Drizzle schema, GraphDAO append-only mutations, CLI surface

**v1.1 — Traversal + Canvas + Telemetry + MCP + Drift** (phases 03–07)
- ✓ Anchor traversal, `traverse()` CTE, ReceiptDAO, RPC daemon
- ✓ Verification Canvas with tier classifier, save-gate (cancel-then-redo + atomic-rename), kernel-degraded fork
- ✓ Telemetry harvester (JSONL watcher, 6-gate portability filter, promoter)
- ✓ MCP gateway (4-provider pool, HTTP server, schema-drift detection)
- ✓ Drift detection + contract locking, ripple analysis, IntentDrift, contract override metrics

**v1.2 — Runtime Polish + Hardening + Closeout** (phases 08–13)
- ✓ Bridge runtime path fixes (stat-then-fallback, dual-candidate dist, bridge mirror)
- ✓ Build & launch ergonomics (sentinel check, freshclone smoke, kernel-prebuild postinstall)
- ✓ Production polish (`mcp.listProviders`, harvest-metrics, missing command contributions)
- ✓ Visual ceremony (11/11 surfaces single-launch)
- ✓ Robustness hardening (auto-save bypass, sync-veto, panel-dispose, mirror gates)
- ✓ Closeout (better-sqlite3 ABI rebuild, single-launch ceremony, sc3 flake fix)

**v2.0 — Deep Features + Polish** (phases 14–17, closed 2026-05-16)
- ✓ DEEP-01: `graph.queryRationaleAt` bitemporal composition + `RationaleChain.tsx`
- ✓ DEEP-02: Graph Inspector (Cytoscape.js + fcose + Graphify dark theme + time-travel slider)
- ✓ DEEP-03: Constraint-lift ripple analysis + hypothetical impact UI
- ✓ DEEP-04: IntentDrift historical-conflict variant (discriminated union end-to-end)
- ✓ DEEP-05: Session-priority lens + `ReadonlyKernelClient` + `refuse-deep05-write.sh`
- ✓ DEEP-06 phase-A/B: `repo_id` cross-repo schema + cross-repo enumeration UI (single-DB partitioning)
- ✓ POLISH-01..04: walkthrough registration, resource-scoped saveGate settings, empty-state, dispatchHover

### Active

<!-- v2.1 — to be built. Verification gates everything else. -->

- [ ] **Verification gate (Phase 18):** Build a real installable GoatIDE (not dev-mode), install it, walk every v2.0 user-visible feature E2E, fix anything broken — including v2.0 deferred gaps (walkthrough foregrounding race; Phase 17 CDP SC11/SC12).
- [ ] **Distribution (C1/C2/C3):** macOS notarization, Windows EV code-signing, Windows + macOS auto-update unified on electron-updater (Squirrel.Windows deprecated 2026-05-13).
- [ ] **Authoring UI:** Light up the `goatide.canvas.addDecisionNode` write path (Phase 17 POLISH-03 stub) + post-hoc rejection (Reject button in `dispatchHover` modal — POLISH-04 stub).
- [ ] **Cross-repo activation:** Multi-daemon kernel orchestration so the `edge[?crossRepo]` Cytoscape selector actually fires against real cross-repo writes (Phase 17 left it dormant).
- [ ] **Walkthrough foregrounding:** Make the GoatIDE walkthrough win the first-launch foreground race against VS Code's default "Setup VS Code" walkthrough (Phase 17 deferred polish).

### Out of Scope

- **Pull request workflow** — Solo dogfood; push to master directly. Never `gh pr create`.
- **LLM-generated rationale in the receipt path (Mandate A)** — `canvas/**` is structurally fenced via `refuse-llm-in-canvas.meta.sh`. Receipts compose from real graph citations only.
- **Inspector write-back (Mandate B)** — `src/inspector/` cannot import `atomicAccept|proposeEdit|recordRejection|recordContractOverride`. Enforced by `refuse-deep05-write.sh`.
- **De-escalation of destructive saves (Mandate D)** — destructive-tier saves never route through `dispatchHover`; the benign-tier setting cannot lower a destructive classification. Pinned by byte-identity tier matrix test.
- **Composite `(id, repo_id)` primary key** — rejected because DROP+RECREATE on canonical tables violates Mandate B. `repo_id` partitions queries, not PK identity.
- **Real-time multi-user collab** — single-developer tool by design.

## Context

**Provenance.** GoatIDE forks `microsoft/vscode @ 1.117.0` (commit `f7392562f06`). The fork is push-able via the Path F GitHub fork strategy (FORK-LFS / GH008 closure). Branding lives in `product.json` (nameShort `GoatIDE`, darwinBundleIdentifier `ai.goatide.GoatIDE`).

**Architecture.** Three runtime components:
1. **Kernel sidecar** (`kernel/`) — Node + Drizzle + SQLite. Bitemporal append-only graph with `valid_from`/`invalidated_at` columns. Spawned as a separate process; communicates via TCP RPC with auth gate. Ships with `better-sqlite3` rebuilt for Electron 39's NODE_MODULE_VERSION 140 ABI (root postinstall).
2. **Bridge extension** (`src/vs/goatide/extensions/goatide-bridge/`) — TypeScript + esbuild + React (webview). Mirrors to `extensions/goatide-bridge/` for VS Code's extension loader; mirror is fenced byte-equal by `refuse-stale-bridge-mirror.sh`. **Note: VS Code currently loads the empty `extensions/goatide-bridge/` stub directly; the real bridge at `src/vs/goatide/extensions/goatide-bridge/` is reachable only through the mirror — see `MEMORY.md` "Bridge extension registration gap"; targeted v2.1 fix.**
3. **Workbench surfaces** — Verification Canvas (`CanvasPanel`, `goatide.canvas`), Graph Inspector (`GraphInspectorPanel`, `goatide.graphInspector`), status-bar liveness/session-priority indicators.

**Planning reconstruction (2026-05-12).** A `gsd-planner` subagent ran `git clean -fdx` and wiped `.planning/` + `.claude/` (both gitignored). `ROADMAP.md`, `REQUIREMENTS.md`, and `STATE.md` were rebuilt from git history + conversation memory; phases 01–12 are *approximate*. Phase 13–17 artifacts are first-class. The shipped code is the authoritative source of truth — when planning docs disagree with the code, trust the code. Destructive-command guardrails now live in `.claude/settings.json` and CLAUDE.md.

**Known-working launch recipe.** Documented in `MEMORY.md` "GoatIDE working launch recipe": compile + transpile, bridge node_modules dance, copy `@vscode/sqlite3` from `remote/`, `VSCODE_DEV=1` + absolute `--extensionDevelopmentPath`. Verified 2026-05-08. v2.1 Phase 18 verification should reduce this to a real installable build.

**Telemetry.** Claude Code JSONL is watched at `~/.claude/projects/`; harvester drives DecisionNode promotion through a 6-gate portability filter + promoter + atomicAccept.

## Constraints

- **Tech stack**: TypeScript pinned to `~5.9.0` (via npm overrides; brander preserves across upstream-sync) — Why: VS Code build tooling drift; FORK-TS-PIN.
- **Tech stack**: SQLite via `better-sqlite3` rebuilt for Electron 39 ABI 140 — Why: kernel runs under Electron-as-Node wrapper; mismatched ABI crashes sidecar on startup (CLOSE-01).
- **Tech stack**: Cytoscape.js (`^3.33.0`) + `cytoscape-fcose` (`^2.2.0`) for Graph Inspector — Why: jsdom-incompatible (canvas), so panel-level tests run under playwright (Phase 15 spike outcome).
- **Tech stack**: Drizzle ORM for kernel schema — Why: bitemporal column conventions + migration meta-tests.
- **Fork hygiene**: No marketplace API usage — Why: FORK-04 CI gate refuses it (Open-VSX-only ecosystem).
- **Fork hygiene**: No `extensions/goatide-bridge/node_modules` committed; `devDependencies` excluded from mirror — Why: `refuse-stale-bridge-mirror.sh`.
- **Operational**: Subagents must NEVER run `git clean`, `git reset --hard`, or `rm -rf .planning|.claude|kernel/dist|out|.build/electron` — Why: 2026-05-12 incident wiped 12 phases of planning; deny rules now in `.claude/settings.json`.
- **Operational**: No PRs (solo dogfood); commits push to master directly. No `Co-Authored-By: Claude` trailers.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fork VS Code rather than ship as extension | Verification Canvas + save-gate need pre-save interception that Extension API doesn't expose | ✓ Good — enables `onWillSaveTextDocument` with `event.waitUntil` semantics |
| Kernel as separate Node sidecar (not in-process) | Isolates SQLite + Drizzle ABI from Electron renderer; bridge can run in kernel-degraded fork when sidecar dies | ✓ Good — recovery banner + reconnect command work; Phase 4 CANV-10 closure |
| Bitemporal append-only graph (`valid_from`/`invalidated_at`) | Time-travel inspector + historical-conflict drift detection require snapshot-at-asOf semantics | ✓ Good — DEEP-04 historical-conflict variant + Graph Inspector slider both depend on it |
| Single-snapshot `asOf` threading top-level on `CanvasShowPayload` | Eliminates `Date.now()` in receipt-composition path; webview cannot drift the snapshot | ✓ Good — Pitfall-1 fence across Phases 14/15/16/17 |
| Mandate A: no LLM rationale in canvas | Receipt provenance must trace to explicit DecisionNode/ConstraintNode rows | ✓ Good — `refuse-llm-in-canvas.meta.sh` structural gate; POLISH-03 empty-state literal byte-fenced |
| Mandate B: `ReadonlyKernelClient` for inspector | Inspector is read-time surface; write RPCs cannot reach it | ✓ Good — `refuse-deep05-write.sh` CI gate + 4-layer defense in Phase 16 |
| Mandate D: destructive saves never de-escalate | `dispatchHover` is benign-only; tier-classifier output cannot be lowered by user setting | ✓ Good — byte-identity matrix test; POLISH-04 |
| Single-DB + `repo_id` partitioning for cross-repo | Composite PK would require DROP+RECREATE (violates Mandate B); query-layer stitching is forward-compatible | ⚠ Revisit — works for v2.0 scope; multi-daemon orchestration deferred to v2.1 needs to validate the model under real cross-repo writes |
| Cytoscape.js for Graph Inspector | Mature canvas renderer + fcose layout; handles 500+ nodes responsively | ✓ Good — Phase 15 DEEP-02; jsdom spike forced playwright for canvas tests |
| Bridge mirror via `prepare_goatide.sh` rather than symlink | VS Code extension loader scans `extensions/` directly; mirror keeps `devDependencies` out | ⚠ Revisit — current registration gap means VS Code loads the stub `extensions/goatide-bridge/`; v2.1 fix needed |
| electron-updater unified for v2.1 (replacing Squirrel.Windows) | Squirrel deprecated 2026-05-13; one updater across macOS + Windows is simpler than parallel Sparkle + Squirrel | — Pending — v2.1 C1/C2/C3 phase |
| Verification gate before v2.1 net-new work (Phase 18) | v2.0 verified via dev-mode CDP smoke (10/12 SCs); has never been walked on a real installable build; Phase 18 closes the trust gap | — Pending — chosen 2026-05-16 at v2.1 kickoff |

## Current Milestone: v2.1 Verify + Ship

**Goal:** Verify v2.0 works end-to-end on a real installable build (not dev-mode), close v2.0 deferred gaps, then ship distribution + DecisionNode authoring + cross-repo activation + walkthrough foregrounding fix.

**Target features:**
- E2E verification of v2.0 on a real built+installed GoatIDE (Phase 18; gates everything else)
- Distribution: C1 macOS notarization, C2 Windows EV code-signing, C3 Windows auto-update (unified electron-updater across both platforms)
- Authoring: `goatide.canvas.addDecisionNode` write path + post-hoc rejection (Reject button)
- Cross-repo activation: multi-daemon kernel orchestration to exercise the dormant `edge[?crossRepo]` rendering
- Walkthrough foregrounding fix (win the first-launch race against VS Code default walkthrough)

---
*Last updated: 2026-05-16 after `/gsd:new-milestone v2.1` kickoff*
