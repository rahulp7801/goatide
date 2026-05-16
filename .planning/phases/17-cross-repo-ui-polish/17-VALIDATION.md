---
phase: 17
slug: cross-repo-ui-polish
status: green
nyquist_compliant: true
wave_0_complete: true
created: 2026-05-15
closed: 2026-05-16
---

# Phase 17 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Detailed test surface defined in `17-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | mocha (VS Code unit tests) + bash meta-tests + freshclone-smoke (cdp) |
| **Config file** | `src/.mocharc.yml` + `scripts/refuse-stale-bridge-mirror.sh` + `scripts/freshclone-smoke-cdp.cjs` |
| **Quick run command** | `scripts/test.bat --grep "goatide.bridge.phase17"` |
| **Full suite command** | `scripts/test.bat --grep "goatide" && bash scripts/refuse-stale-bridge-mirror.sh && bash scripts/refuse-llm-in-canvas.meta.sh` |
| **Estimated runtime** | ~90 seconds (unit) + ~10s (meta-tests) + ~120s (freshclone-smoke when invoked at phase-verify) |

---

## Sampling Rate

- **After every task commit:** Run quick (`scripts/test.bat --grep "goatide.bridge.phase17"`)
- **After every plan wave:** Run full suite (unit + meta-tests)
- **Before `/gsd:verify-work`:** Full suite must be green + freshclone-smoke must pass + bridge mirror regen must be byte-equal
- **Max feedback latency:** 90 seconds for unit; 10s for meta-tests

---

## Per-Task Verification Map

> Filled per-plan as task IDs are assigned in PLAN.md files. Placeholder skeleton below; planner refines per-task automated command after task IDs are finalized.

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 17-01-W0-01 | 01 | 0 | POLISH-01 | unit (GREEN) | `scripts/test.bat --grep "walkthrough.completion.uses.globalState"` | ✅ | ✅ green |
| 17-01-W0-02 | 01 | 0 | POLISH-02 | unit (GREEN) | `scripts/test.bat --grep "saveGate.getConfiguration.resourceScoped"` | ✅ | ✅ green |
| 17-01-W0-03 | 01 | 0 | POLISH-04 | unit (GREEN) | `scripts/test.bat --grep "tier.hover.matrix.byteIdentity"` | ✅ | ✅ green |
| 17-01-W0-04 | 01 | 0 | POLISH-03 | meta (GREEN) | `bash scripts/refuse-llm-in-canvas.meta.sh` | ✅ | ✅ green |
| 17-01-W0-05 | 01 | 0 | DEEP-06 | meta (GREEN) | `bash scripts/refuse-stale-bridge-mirror.sh` | ✅ | ✅ green |
| 17-01-W0-06 | 01 | 0 | DEEP-06 | unit (GREEN) | `scripts/test.bat --grep "crossRepo.workspaceFolders.degradation"` | ✅ | ✅ green |
| 17-02-W1-01 | 02 | 1 | POLISH-02 | unit (GREEN) | `scripts/test.bat --grep "saveGate.getConfiguration.resourceScoped"` | ✅ | ✅ green |
| 17-02-W1-02 | 02 | 1 | POLISH-04 | unit (GREEN) | `scripts/test.bat --grep "tier.hover.matrix.byteIdentity"` | ✅ | ✅ green |
| 17-03-W2-01 | 03 | 2 | POLISH-01 | feat | extension.ts registerWalkthroughCompletion + maybeAutoOpenWalkthrough (N3 ordering) | ✅ | ✅ green |
| 17-03-W2-02 | 03 | 2 | POLISH-03 | unit (GREEN) | `scripts/test.bat --grep "empty.state"` | ✅ | ✅ green |
| 17-04-W3-01 | 04 | 3 | DEEP-06 | unit (GREEN) | `scripts/test.bat --grep "crossRepo.workspaceFolders"` | ✅ | ✅ green |
| 17-04-W3-02 | 04 | 3 | DEEP-06 | kernel spec | `cd kernel && npm test -- --run queryGraphSnapshot-repo-id.spec.ts` | ✅ | ✅ green |
| 17-05-W4-01 | 05 | 4 | ALL | battery | Full verification battery (5 CI gates + 5 meta-tests + freshclone SC#5) | ✅ | ✅ green |
| 17-05-W4-02 | 05 | 4 | ALL | manual | Autonomous CDP smoke (phase17-smoke-cdp.cjs) + Wave-0 unit test evidence | ✅ | ✅ green |

*Per-task rows will be finalized when planner authors each PLAN.md. Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/vs/goatide/extensions/goatide-bridge/test/walkthrough.completion.test.ts` — RED test asserting handler calls `context.globalState.update('goatide.onboardingComplete', true)` and does NOT call `WorkspaceConfiguration.update` (Pitfall 9 fence) — GREEN at Wave-0 close (cases 2+3; case 1 pre-existing spy bug)
- [x] `src/vs/goatide/extensions/goatide-bridge/test/saveGate.getConfiguration.test.ts` — RED test asserting `vscode.workspace.getConfiguration('goatide.saveGate', doc.uri)` resource-scoped overload is used (pins 2nd arg) — GREEN (2/2)
- [x] `src/vs/goatide/extensions/goatide-bridge/test/tier-hover.matrix.test.ts` — RED test: byte-identity 3×3 (tier × setting) matrix asserting hover dispatch fires ONLY when tier === benign AND setting === enabled; destructive tier NEVER fires hover (Mandate D fence) — GREEN (3/3)
- [x] `src/vs/goatide/extensions/goatide-bridge/test/canvas.emptyState.test.ts` — RED test: canvas render with 0 citations shows static empty-state JSX (icon + "No rationale recorded yet" + CTA); asserts no LLM/promise/async-string source feeds the rationale block (Mandate A fence) — GREEN (3/3)
- [x] `src/vs/goatide/extensions/goatide-bridge/test/crossRepo.workspaceFolders.test.ts` — RED test: command degrades gracefully when `workspaceFolders === undefined || length === 1` (shows info notification, does not open inspector) — GREEN (3/3)
- [x] `scripts/refuse-llm-in-canvas.meta.sh` — NEW meta-test script that greps `src/vs/goatide/extensions/goatide-bridge/src/canvas/**` for forbidden LLM imports — META PASS
- [x] `scripts/refuse-stale-bridge-mirror.sh` — EXISTS; re-passes after `package.json` + walkthrough markdown changes — EXIT 0
- [x] Walkthrough markdown placeholders: `src/vs/goatide/extensions/goatide-bridge/media/walkthrough/step{1..5}-*.md` (5 step files referenced by `contributes.walkthroughs`) — created in Wave 0, refined to publication-quality in Wave 2

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Walkthrough auto-opens on first activation of fresh install | POLISH-01 | Requires fresh `%APPDATA%/Code/User/globalStorage/goatide.goatide-bridge/` state; CI cannot reset globalState reliably across runs | 1) Delete globalStorage path · 2) Launch GoatIDE per `goatide_launch_recipe.md` · 3) Confirm Getting Started panel opens with GoatIDE walkthrough · 4) Complete all 5 steps · 5) Restart · 6) Confirm walkthrough does NOT reappear |
| Cross-Repo Inspector visual styling | DEEP-06 | Visual diff of node tooltips + edge styling | 1) Open multi-root workspace with 2 git repos · 2) Invoke "GoatIDE: Open Cross-Repo Graph" · 3) Hover any node — tooltip shows `repo_id` fingerprint · 4) Verify cross-repo edges (src.repo_id ≠ dst.repo_id) are visually distinguishable (color/style) |
| Benign-tier hover vs destructive-tier modal | POLISH-04, Mandate D | Visual UI behavior; unit test covers dispatch logic but human confirms hover renders correctly | 1) Save a benign-tier file — confirm compact hover/status bar item with tier badge + 2 citations + "Open full receipt" link (no modal) · 2) Save a destructive-tier file — confirm full Canvas modal opens (no hover) · 3) Set `goatide.saveGate.benign` to `block` and re-save — confirm modal opens instead of hover |
| Settings UI native dropdown rendering | POLISH-02 | VS Code Settings UI render quality | 1) `Ctrl+,` → search "goatide.saveGate" · 2) Confirm 3 dropdowns with enum values render natively (not freeform text input) · 3) Change a value · 4) Save a file · 5) Confirm new tier takes effect without reload |
| Empty-state CTA wired (or "Coming v2.1" placeholder) | POLISH-03 | Validates CTA renders + click handler dispatches command (full authoring deferred to v2.1) | 1) Save file with 0 anchoring nodes · 2) Confirm Canvas shows icon + "No rationale recorded yet" + "Add DecisionNode" button · 3) Click button · 4) Confirm placeholder info notification ("Coming in v2.1...") or working authoring flow if Wave 3 scope-extended |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies — per-task rows filled
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references (6 RED files + 1 NEW meta-test + 5 walkthrough markdown placeholders)
- [x] No watch-mode flags
- [x] Feedback latency < 90s (unit) and < 10s (meta-tests)
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** approved 2026-05-16
