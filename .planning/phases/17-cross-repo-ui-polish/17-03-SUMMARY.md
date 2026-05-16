---
phase: 17-cross-repo-ui-polish
plan: 03
subsystem: ui
tags: [vscode-extension, walkthrough, empty-state, mandate-a, polish, typescript, react]

# Dependency graph
requires:
  - phase: 17-cross-repo-ui-polish
    plan: 01
    provides: Wave-0 RED test empty-state-mandate-a.test.tsx + walkthrough-completion.ts real body + 5 walkthrough markdown placeholders
  - phase: 17-cross-repo-ui-polish
    plan: 02
    provides: dispatchHover + resource-scoped save-gate config

provides:
  - extension.ts: POLISH-01 walkthrough wiring (registerWalkthroughCompletion + maybeAutoOpenWalkthrough + goatide.canvas.addDecisionNode placeholder)
  - CitationList.tsx: POLISH-03 Mandate A empty-state (icon + heading + paragraph + CTA) with onAddDecisionNode prop
  - rpc.ts + messages.ts + panel.ts: canvas.requestAddDecisionNode message variant end-to-end routing
  - styles.css: .goatide-citation-empty-* rules using --vscode-* tokens only
  - 5 walkthrough markdown files: publication-quality copy replacing Wave-0 placeholders
  - Bridge mirror byte-equal for media/walkthrough/*.md

affects:
  - 17-04-wave3-cross-repo-command (inherits extension.ts activation pattern)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - ORDERING INVARIANT N3: all registerCommand calls before maybeAutoOpenWalkthrough fires
    - onClick arrow wrapper pattern: onClick={() => onAddDecisionNode?.()} to avoid forwarding React event as argument
    - POLISH-03 Mandate A: heading textContent is BYTE-EXACT static literal; no template interpolation

key-files:
  created: []
  modified:
    - src/vs/goatide/extensions/goatide-bridge/src/extension.ts
    - src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/CitationList.tsx
    - src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/App.tsx
    - src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/styles.css
    - src/vs/goatide/extensions/goatide-bridge/src/canvas/rpc.ts
    - src/vs/goatide/extensions/goatide-bridge/src/canvas/messages.ts
    - src/vs/goatide/extensions/goatide-bridge/src/canvas/panel.ts
    - src/vs/goatide/extensions/goatide-bridge/media/walkthrough/step1-canvas.md
    - src/vs/goatide/extensions/goatide-bridge/media/walkthrough/step2-receipt.md
    - src/vs/goatide/extensions/goatide-bridge/media/walkthrough/step3-intentdrift.md
    - src/vs/goatide/extensions/goatide-bridge/media/walkthrough/step4-settings.md
    - src/vs/goatide/extensions/goatide-bridge/media/walkthrough/step5-inspector.md
    - extensions/goatide-bridge/media/walkthrough/step1-canvas.md
    - extensions/goatide-bridge/media/walkthrough/step2-receipt.md
    - extensions/goatide-bridge/media/walkthrough/step3-intentdrift.md
    - extensions/goatide-bridge/media/walkthrough/step4-settings.md
    - extensions/goatide-bridge/media/walkthrough/step5-inspector.md

key-decisions:
  - "ORDERING INVARIANT N3: goatide.canvas.addDecisionNode and goatide.onboarding.complete both registered BEFORE maybeAutoOpenWalkthrough fires -- prevents race where walkthrough renders command-link buttons against unregistered handlers"
  - "onClick arrow wrapper for CTA: onClick={() => onAddDecisionNode?.()} prevents React synthetic event from being forwarded as an argument to the callback -- Wave-0 test asserts args.length === 0"
  - "WebviewRpc.postAddDecisionNode uses this.vscode.postMessage() directly (not this.postRaw which lives on HostRpc) -- WebviewRpc has no postRaw method"
  - "styles.css: old .goatide-citation-empty info-banner styles fully replaced (no legacy fallback colors) -- POLISH-03 empty state is the definitive empty state UX"
  - "Bridge mirror synced via cp (not prepare_goatide.sh) for walkthrough markdown refinements -- consistent with Plan 17-01 cp precedent"
  - "Walkthrough copy: Wave-0 placeholder note lines ('Wave 3 note: ...') removed; real informational content written for each step (~80-150 words each)"

patterns-established:
  - "N3 ordering invariant: any fire-and-forget async call (maybeAutoOpenWalkthrough) must come AFTER all registerCommand calls that the fired action may need"
  - "CTA onClick wrapping: for props of type () => void, always use onClick={() => prop?.()} not onClick={prop} to prevent React event forwarding"

requirements-completed:
  - POLISH-01
  - POLISH-03

# Metrics
duration: 13min
completed: 2026-05-16
---

# Phase 17 Plan 03: POLISH-01 Walkthrough Wiring + POLISH-03 Empty-State Mandate A Summary

**POLISH-01 extension.ts wiring (registerWalkthroughCompletion + maybeAutoOpenWalkthrough + goatide.canvas.addDecisionNode placeholder) + POLISH-03 Verification Canvas empty-state with Mandate A static text; Wave-0 RED test empty-state-mandate-a.test.tsx 3/3 GREEN-flipped; 5 walkthrough markdown files refined to publication-quality copy.**

## Performance

- **Duration:** ~13 min
- **Started:** 2026-05-16T05:40:46Z
- **Completed:** 2026-05-16
- **Tasks:** 2
- **Files modified:** 19 (13 source + 5 mirror + 1 source extension.ts)

## Accomplishments

- `extension.ts activate()`: imports and calls `registerWalkthroughCompletion(context)` + registers `goatide.canvas.addDecisionNode` placeholder (v2.1 informational message body) BEFORE `void maybeAutoOpenWalkthrough(context)` fires (N3 ordering invariant documented with inline comments)
- `CitationList.tsx` empty-state replaced: SVG icon (info circle path) + `h3` with BYTE-EXACT literal `'No rationale recorded yet'` (data-testid="empty-state-heading") + body paragraph + CTA button (data-testid="empty-state-add-decision-node") wired via `onAddDecisionNode` optional prop
- `App.tsx`: `<CitationList>` now passes `onAddDecisionNode={() => rpc.postAddDecisionNode()}` prop
- `rpc.ts`: `WebviewRpc.postAddDecisionNode()` posts `{type: 'canvas.requestAddDecisionNode'}` via `this.vscode.postMessage(msg)`
- `messages.ts`: `WebviewToHostSchema` extended with `canvas.requestAddDecisionNode` (no payload -- pure trigger)
- `panel.ts handleMessage`: new if-arm routes `canvas.requestAddDecisionNode` to `vscode.commands.executeCommand('goatide.canvas.addDecisionNode')` (matches existing if-chain pattern at lines 333-449)
- `styles.css`: old info-banner `.goatide-citation-empty` rules replaced with POLISH-03 flex-column layout; new `.goatide-citation-empty-icon`, `.goatide-citation-empty h3`, `.goatide-citation-empty p`, `.goatide-citation-empty-cta`, `.goatide-citation-empty-cta:hover` rules using `--vscode-*` tokens only
- 5 walkthrough markdown files: Wave-0 placeholder notes removed; publication-quality copy written for all steps (100-150 words each covering Canvas, Reasoning Receipts, IntentDrift, settings, Graph Inspector)
- Bridge mirror synced: `extensions/goatide-bridge/media/walkthrough/*.md` byte-equal via `cp`
- Wave-0 RED test `empty-state-mandate-a.test.tsx` 3/3 GREEN-flipped
- `refuse-llm-in-canvas.meta.sh` META PASS; `refuse-stale-bridge-mirror-after-walkthrough.meta.sh` META PASS; `refuse-deep05-write.sh` exit 0; `refuse-stale-bridge-mirror.sh` exit 0; `refuse-unbounded-ripple-walk.sh` exit 0

## Task Commits

1. **Task 1: POLISH-01 walkthrough wiring + 5 markdown copy refinements** - `8dbbf291b97` (feat)
2. **Task 2: POLISH-03 empty-state Mandate A GREEN + CTA wiring** - `18675414b37` (feat)

## Files Created/Modified

- `src/vs/goatide/extensions/goatide-bridge/src/extension.ts` -- POLISH-01 imports + N3-ordered wiring (registerWalkthroughCompletion, addDecisionNode, maybeAutoOpenWalkthrough)
- `src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/CitationList.tsx` -- POLISH-03 empty-state; onAddDecisionNode prop; onClick arrow wrapper
- `src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/App.tsx` -- onAddDecisionNode prop wired to rpc.postAddDecisionNode()
- `src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/styles.css` -- .goatide-citation-empty-* POLISH-03 flex-column rules; --vscode-* tokens only
- `src/vs/goatide/extensions/goatide-bridge/src/canvas/rpc.ts` -- WebviewRpc.postAddDecisionNode() method
- `src/vs/goatide/extensions/goatide-bridge/src/canvas/messages.ts` -- canvas.requestAddDecisionNode discriminator
- `src/vs/goatide/extensions/goatide-bridge/src/canvas/panel.ts` -- handleMessage if-arm for canvas.requestAddDecisionNode
- `src/vs/goatide/extensions/goatide-bridge/media/walkthrough/step{1..5}-*.md` -- publication-quality copy (5 files)
- `extensions/goatide-bridge/media/walkthrough/step{1..5}-*.md` -- mirror (byte-equal, 5 files)

## Decisions Made

- **N3 ordering invariant for maybeAutoOpenWalkthrough:** `registerWalkthroughCompletion` + `goatide.canvas.addDecisionNode` both registered with `context.subscriptions.push` BEFORE `void maybeAutoOpenWalkthrough(context)` is called. If `openWalkthrough` renders before handlers are registered, command-link buttons in the Getting Started panel fire against unregistered commands and VS Code shows error toasts. Ordering is documented with an inline comment block in extension.ts.
- **onClick arrow wrapper:** The Wave-0 test asserts `addDecisionNodeCallArgs[0]?.length === 0` (prop called with no arguments). React's `onClick` handler receives the synthetic click event as arg[0] if the prop function is passed directly (`onClick={prop}`). Fixed via `onClick={() => onAddDecisionNode?.()}` which wraps the call and discards the event.
- **WebviewRpc.postAddDecisionNode uses this.vscode.postMessage directly:** The plan spec said `postRaw` but `postRaw` only exists on `HostRpc` (runs in extension host); `WebviewRpc` (runs in webview) has no such method. Auto-fixed: used `const msg: WebviewToHost = { type: 'canvas.requestAddDecisionNode' }; this.vscode.postMessage(msg)` -- identical behavior, correct class.
- **styles.css: full replacement of old .goatide-citation-empty:** The Wave-0 empty state had an info-banner style with `--vscode-editorInfo-background` and a `::before` pseudo-element. These were replaced entirely by the POLISH-03 flex-column layout. No fallback-color values retained in the new rules (using `--vscode-*` without `, #fallback` per plan spec for Mandate A styles).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] WebviewRpc.postAddDecisionNode used this.postRaw (HostRpc method)**
- **Found during:** Task 2 Step 3 (bridge tsc compile after rpc.ts edit)
- **Issue:** Plan spec said `this.postRaw({ type: 'canvas.requestAddDecisionNode' })`. But `postRaw` is a method on `HostRpc`, not `WebviewRpc`. `WebviewRpc` communicates via `this.vscode.postMessage()`. TypeScript error: `Property 'postRaw' does not exist on type 'WebviewRpc'`
- **Fix:** Changed to `const msg: WebviewToHost = { type: 'canvas.requestAddDecisionNode' }; this.vscode.postMessage(msg)` -- identical semantics, correct API surface
- **Files modified:** src/canvas/rpc.ts
- **Verification:** tsc compile GREEN; test 2/3 GREEN (postMessage is the correct postRaw equivalent for WebviewRpc)
- **Committed in:** 18675414b37

**2. [Rule 1 - Bug] onClick={onAddDecisionNode} forwarded React event as first argument**
- **Found during:** Task 2 test run (test 2/3 failing -- args.length === 1 not 0)
- **Issue:** React onClick passes the synthetic MouseEvent to the handler. The Wave-0 test spy uses `...args` and asserts `args.length === 0`. Direct `onClick={onAddDecisionNode}` caused the event to be forwarded.
- **Fix:** Changed to `onClick={() => onAddDecisionNode?.()}` -- arrow wrapper discards the event, calls prop with no arguments
- **Files modified:** src/canvas/webview/CitationList.tsx
- **Verification:** test 2/3 GREEN (addDecisionNodeCallArgs[0]?.length === 0)
- **Committed in:** 18675414b37

---

**Total deviations:** 2 auto-fixed (2 Rule 1 - Bug)
**Impact on plan:** Both auto-fixes were mechanical correctness fixes with zero scope change.

## Pre-existing Issues (not caused by this plan)

- `walkthrough-completion.test.ts` test 1/3 (Pitfall 9 fence) is RED due to a test spy design bug: the test installs a `executeCommand` spy that intercepts ALL calls (including the `goatide.onboarding.complete` dispatch) BEFORE passing through to the vscode-stub registered command map. This means the registered command body never runs and `context.globalState.update` is never called. Confirmed pre-existing by `git stash` + re-run before Task 2 changes. Documented in 17-02 SUMMARY as "walkthrough-completion.test.ts (stub executeCommand dispatch bug pre-dates this plan)". NOT caused by Plan 17-03 changes.
- 19 total failing tests (same as 17-02 baseline) -- all pre-existing. Plan 17-03 introduced 0 new failures.

## Test Count Summary

- **Wave-0 RED tests GREEN-flipped by this plan:** `empty-state-mandate-a.test.tsx` 3/3 (POLISH-03 Mandate A)
- **Cumulative test state (119 passing, 19 failing, 3 pending):** unchanged from Plan 17-02 baseline, plus 3 new GREEN (empty-state mandate-a)

## Next Phase Readiness

- Plan 17-04 (Wave 3 -- cross-repo command): GREEN-flip targets: `cross-repo-command.test.ts` 3/3. Must add `goatide.openCrossRepoGraph` registration in extension.ts + `GraphInspectorPanel.getOrCreateForCrossRepo` static method.
- extension.ts N3 pattern established: any future fire-and-forget activation calls should follow the same pre-registration ordering convention.

---
*Phase: 17-cross-repo-ui-polish*
*Completed: 2026-05-16*
