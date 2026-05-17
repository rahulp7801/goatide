# Stack Research

**Domain:** VS Code fork — bitemporal graph IDE (v2.0 deep features + polish + Windows auto-update)
**Researched:** 2026-05-13
**Confidence:** HIGH for graph viz and auto-update; MEDIUM for kernel additions (no breaking changes expected)

---

## Scope

This file covers ONLY stack additions for v2.0. The existing stack (Electron 39.8.7, Node 22, TypeScript ~5.9.0,
better-sqlite3 + Drizzle, React 18, esbuild, vscode-jsonrpc, Zod, chokidar, simple-git, express, mocha+jsdom,
vitest, Playwright) is already in place. Do not re-add or change any of those.

---

## Recommended Stack

### DEEP-02: Graph Inspector (time-travel visualization)

**Primary library: Cytoscape.js**

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `cytoscape` | `^3.33.0` | Graph rendering + layout engine | ~500K weekly downloads. Canvas-based, handles up to 5K nodes before FPS degrades — well within GoatIDE's per-repo graph size. Rich algorithmic API (BFS, shortest-path, centrality) maps naturally to bitemporal traversal. TypeScript types built-in. Integrates directly with React via a `useRef` + imperative API pattern — no separate wrapper package needed. |
| `@types/cytoscape` | `^3.19` | TypeScript declarations | Bundled with cytoscape 3.33 but the @types package provides cleaner IDE integration |

**Why Cytoscape.js over alternatives:**

- **Sigma.js + graphology**: Sigma is the right call for 100K+ node graphs. GoatIDE's bitemporal graph grows at O(edits × files) per repo — even a 100K-line codebase is unlikely to exceed 10K graph nodes. Sigma's required peer `graphology` (~0.26.0, last published >12 months ago, no bitemporal concept) adds a parallel in-memory graph model that duplicates the kernel's SQLite graph. That's unnecessary overhead. Sigma's `@react-sigma/core` wrapper adds bundle weight. Skip for primary use.
- **vis-network v9.x**: ~200K weekly downloads. Its reactive DataSet objects are convenient but the physics simulation engine is overkill for a static bitemporal snapshot viewer. Worse, vis-network bundles its own styles and is harder to theme to match VS Code's token colors.
- **D3-force only**: D3's force-directed simulation is a building block, not a complete solution. Writing a full graph component on top of D3 adds 3-4x implementation complexity. Cytoscape provides layouts including `fcose` (force-directed) as a plugin, so you get D3-quality layouts without the DIY tax.

**Bundle size impact:** Cytoscape.js min+gzip is ~110KB. The existing webview bundle already includes React (~45KB), react-dom (~130KB), and monaco-editor (>1MB). 110KB is acceptable. The DEEP-02 inspector will open in its own `WebviewPanel` (separate from the existing Verification Canvas panel), so the existing Canvas bundle is unaffected.

**CSP compatibility:** The existing Canvas CSP (`script-src ... 'unsafe-eval'`) already permits what Cytoscape needs. The Graph Inspector will use the same CSP template with the same `${webview.cspSource}` + nonce pattern. Do NOT enable Cytoscape's experimental WebGL renderer (opt-in via `options.webgl: true` in v3.31+) in the initial release — it is provisional with API-breaking changes flagged in their own release notes and does not yet support all edge styles. Use the default canvas renderer.

**Time-travel slider:** Implement as a plain HTML `<input type="range">` controlled by React state, updating Cytoscape's `cy.elements().not('[valid_from > asOf]')` filter on change. No additional library needed. The bitemporal `valid_from`/`valid_to` fields are already on every node and edge in the kernel schema.

**Layout plugin: `cytoscape-fcose`** — a force-directed layout based on COSE Bilkent that produces readable node placement for dependency graphs. Install alongside cytoscape.

| Library | Version | Purpose |
|---------|---------|---------|
| `cytoscape-fcose` | `^2.2.0` | Force-directed layout for Cytoscape (replaces default COSE with a better algorithm for larger graphs) |

**Note on reference repos:** Both Graphify (safishamsi) and code-review-graph (tirth8205) are Python CLI tools that generate static `graph.html` outputs. code-review-graph uses D3.js for its force-directed rendering. Neither repo's JavaScript dependency tree applies directly to GoatIDE's webview — use them for visual style inspiration (node color coding by type, edge label styling) not for library selection.

---

### DEEP-01, DEEP-03, DEEP-04, DEEP-05: Kernel RPC extensions

No new dependencies. All four features extend the existing kernel TCP RPC surface.

| Feature | What it needs | Where it lives | New dep? |
|---------|--------------|----------------|---------|
| DEEP-01: rationale-chain query | New `kernel.queryRationaleChain(anchor, asOf)` RPC handler executing a recursive CTE walk on ConstraintNodes + DecisionNodes | `kernel/src/rpc/` | None — Drizzle + better-sqlite3 already present |
| DEEP-03: constraint-lift ripple | Extend `runRippleAnalysis` to accept a confidence threshold param + return weighted scores | `kernel/src/drift/` | None — `diff` package already present for edit-distance weighting |
| DEEP-04: historical-supersession IntentDrift | Add `supersededAt` predicate to `DriftDetector.detect()` by joining `provenance` table for supersession chains | `kernel/src/drift/` | None |
| DEEP-05: session-priority lens | In-memory re-rank of a `ReceiptRow[]` by session priority without DB write | `kernel/src/receipt/` | None |

**Bridge additions (DEEP-01, DEEP-03, DEEP-04, DEEP-05):** New RPC message types in `KernelClient` + new React components in the Verification Canvas or status-bar surfaces. No new bridge npm dependencies — extend existing `zod` schemas + existing React component tree.

---

### DEEP-06: Cross-repo graph stitching

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| `simple-git` | Already in kernel (`^3.27`) | Detect workspace roots + git remote URLs for cross-repo identity | Already present — use `simpleGit(repoPath).remote(['get-url', 'origin'])` to derive a stable repo key for cross-repo edge namespace |

**What DEEP-06 actually needs:** A `repoId` column on `nodes` and `edges` tables (new Drizzle migration). Cross-repo traversal is a JOIN filter, not a new library. The `simple-git` dep is already in kernel for harvester — reuse it to fingerprint each workspace folder as a repo key. No new kernel packages.

**Bridge additions:** A new `goatide.graph.showCrossRepoEdges` command + workspace folder enumeration using the VS Code `vscode.workspace.workspaceFolders` API (already available in extension host — no new dep).

---

### POLISH-01: First-run onboarding

**Use the VS Code `contributes.walkthroughs` contribution point.** This is the correct mechanism (HIGH confidence — official VS Code extension API, available since 1.74, stable in 1.117).

| Component | How to implement | New dep? |
|-----------|----------------|---------|
| Walkthrough definition | `contributes.walkthroughs` in `goatide-bridge/package.json` — array of steps with `title`, `description`, `media` (SVG or Markdown) | None |
| Step trigger | `when: "!goatide.onboardingComplete"` context key set via `vscode.commands.executeCommand('setContext', ...)` on first activation | None |
| Completion tracking | `vscode.workspace.getConfiguration('goatide').update('onboardingComplete', true, ConfigurationTarget.Global)` | None |

No new npm packages. The walkthrough infrastructure is native to the VS Code contribution point system. Avoid third-party onboarding libraries (react-joyride, shepherd.js) — they cannot integrate with VS Code's Getting Started panel and add ~30KB webview bundle weight for something the platform provides for free.

---

### POLISH-02: Settings UI for save-gate strictness

No new dependencies.

**Mechanism:** Add three new `contributes.configuration` properties to `goatide-bridge/package.json`:
```json
"goatide.saveGate.destructive": { "type": "string", "enum": ["block","confirm","suppress"] },
"goatide.saveGate.highImpact": { "type": "string", "enum": ["block","confirm","suppress"] },
"goatide.saveGate.benign": { "type": "string", "enum": ["confirm","suppress"] }
```
Scope all three with `"scope": "resource"` (per-workspace). The VS Code Settings UI renders `enum` + `enumDescriptions` as a dropdown automatically. No custom settings webview needed.

**Read in bridge:** `vscode.workspace.getConfiguration('goatide.saveGate', workspaceUri)` in the save-gate handler. This is the standard `WorkspaceConfiguration` API — no new deps.

---

### POLISH-03: Empty-state UX

No new dependencies. The existing React `CitationList` component in the Verification Canvas webview handles the empty state with a conditional render. This is a pure UI change — new JSX, updated CSS custom properties matching VS Code token colors.

---

### POLISH-04: Hover-driven receipt drilldown

No new dependencies. VS Code 1.117 exposes `vscode.languages.registerHoverProvider` for the extension host side, and the existing `IHoverService` in the workbench layer handles hover lifecycle. For the bridge extension context, use `vscode.languages.registerHoverProvider` + `vscode.MarkdownString` to render compact receipt summaries inline.

**If richer hover UI is needed** (e.g. a mini-Canvas): use `vscode.window.createWebviewPanel` with `retainContextWhenHidden: false` positioned near the cursor. The existing `CanvasPanel` is the template. No new libraries.

---

### C3: Windows Auto-Update

**Decision: Use `electron-builder` + `electron-updater` with NSIS installer, NOT the inherited VS Code InnoSetup + `inno_updater.exe` mechanism.**

**Rationale for this choice:**

The inherited `build/gulpfile.vscode.win32.ts` + `build/win32/code.iss` pipeline targets Microsoft's production update infrastructure (`createUpdateURL` calls `${product.updateUrl}/api/update/${platform}/${quality}/${commit}`). That server (update.code.visualstudio.com) is Microsoft's — GoatIDE cannot write to it. Adapting the InnoSetup pipeline requires:
1. Running your own update API server matching VS Code's REST contract
2. Cross-compiling the Rust `inno_updater.exe` for GoatIDE's AppId
3. Code-signing the InnoSetup installer with an EV cert (deferred to v2.1)

This is multi-month infrastructure work. `electron-builder` + `electron-updater` provides the same end result (NSIS installer, background update, channel selection, rollback) with a GitHub Releases publish provider that requires zero server infrastructure.

**Confirmed finding:** electron-builder explicitly marks Squirrel.Windows as deprecated and unsupported for auto-update. NSIS is the correct Windows target.

| Package | Version | Where | Purpose |
|---------|---------|-------|---------|
| `electron-builder` | `^26.8.1` | root `devDependencies` | Builds NSIS installer, generates `latest.yml` update metadata, publishes to GitHub Releases |
| `electron-updater` | `^6.8.3` | root `dependencies` (ships in app) | Runtime auto-update client — polls GitHub Releases for `latest.yml`, downloads delta `.blockmap`, installs in background via NSIS silent mode |

**Build configuration:** Add an `electron-builder.yml` (or `build` key in a separate config file — not in the root `package.json` `build` key since that conflicts with the VS Code build system) with:
```yaml
appId: ai.goatide.GoatIDE
productName: GoatIDE
win:
  target: nsis
  signingHashAlgorithms: [sha256]
nsis:
  oneClick: false
  perMachine: false
  allowToChangeInstallationDirectory: true
  deleteAppDataOnUninstall: false
publish:
  provider: github
  owner: <github-org>
  repo: goatide
```

**Channel selection:** electron-updater supports stable/beta/alpha channels via version semver pre-release tags (`1.2.3-beta.0` → beta channel). Set `autoUpdater.channel = 'beta'` before `checkForUpdatesAndNotify()`. Generate `beta.yml` alongside `latest.yml` by setting `"generateUpdatesFilesForAllChannels": true` in electron-builder config.

**VSCODE_DEV=1 interaction:** When `VSCODE_DEV=1` is set (GoatIDE's default for dev-checkout), `autoUpdater.isUpdaterActive()` returns false because the app is running from source. Gate all `electron-updater` initialization behind `!process.env.VSCODE_DEV`. For testing the update flow without a real install, use `autoUpdater.forceDevUpdateConfig = true` + a `dev-app-update.yml` in the repo root pointing at a test GitHub release. The freshclone-smoke CDPharness currently asserts `VSCODE_DEV=1` on launch (HARDEN-06) — add an assertion that `autoUpdater.isUpdaterActive()` is false in dev mode to prevent accidental update polling during CI.

**Integration point:** Add a new `src/vs/goatide/update/goatideUpdater.ts` module in the Electron main process that initializes `electron-updater` on `app.whenReady()` — this is outside the VS Code workbench layer and avoids touching `src/vs/platform/update/` (which remains the VS Code InnoSetup path, left unchanged for upstream sync hygiene).

**Code signing note:** C2 (EV cert) is deferred to v2.1. Without code signing, the NSIS installer triggers Windows SmartScreen on first run. This is acceptable for v2.0 solo dogfood. The `electron-builder` config should NOT include `signtoolOptions` until the cert is available — attempting to sign without a cert will break CI.

---

## Installation (new packages only)

```bash
# Bridge webview — graph inspector
cd src/vs/goatide/extensions/goatide-bridge
npm install cytoscape cytoscape-fcose
npm install -D @types/cytoscape

# Root — Windows installer + auto-update (run from repo root)
npm install -D electron-builder@^26.8.1
npm install electron-updater@^6.8.3
```

Note: `electron-updater` goes in root `dependencies` (not `devDependencies`) because it ships inside the packaged Electron app. `electron-builder` is dev-only.

After adding `cytoscape` to the bridge, regenerate the bridge mirror:
```bash
bash scripts/prepare_goatide.sh
```

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| Cytoscape.js 3.33 | Sigma.js 3.x + graphology | Sigma is better at 100K+ nodes. GoatIDE graphs won't reach that scale in v2.0. graphology adds a parallel in-memory model that duplicates the kernel's SQLite source of truth. |
| Cytoscape.js 3.33 | vis-network 9.x | vis-network physics simulation is designed for interactive drag/drop network diagrams, not read-only temporal graph inspection. Harder to theme to VS Code token colors. |
| Cytoscape.js 3.33 | D3-force (raw) | 3-4x implementation complexity for the same result. Cytoscape wraps force-directed layout as the `fcose` plugin. |
| electron-builder + NSIS | Adapted InnoSetup pipeline | InnoSetup pipeline requires GoatIDE's own update API server + Rust inno_updater.exe rebuild. 2+ months of infrastructure work for a feature that electron-builder delivers in days via GitHub Releases. |
| electron-builder + NSIS | Squirrel.Windows | electron-builder explicitly deprecated Squirrel.Windows. No auto-update support in Squirrel via electron-builder. VS Code uses Squirrel as a legacy historical choice tied to Microsoft's update CDN. |
| contributes.walkthroughs | react-joyride / Shepherd.js | Platform-native walkthroughs integrate with VS Code's Getting Started panel. Third-party tour libraries require a webview host, add bundle weight, and produce UX that looks foreign to VS Code users. |
| WorkspaceConfiguration enum | Custom settings webview | VS Code renders `enum` + `enumDescriptions` as a native dropdown in Settings UI automatically. No custom webview needed for POLISH-02. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Naive vector retrieval (pgvector, hnswlib, etc.) | CI gate `scripts/ci/refuse-vector-libs.sh` explicitly blocks this. GoatIDE's retrieval model is graph traversal over the bitemporal kernel — embedding-based retrieval would contradict the thesis. | Recursive CTE walks + AnchorResultCache (already built) |
| graphology as standalone graph model | Duplicates kernel's SQLite graph in browser memory. No bitemporal concept. Peers with sigma.js but neither is needed for GoatIDE's graph sizes. | Cytoscape's built-in element model, populated via a `graph.queryNodes` RPC call snapshot |
| OpenAI / LLM prompt-based documentation | Another CI-blocked pattern. GoatIDE surfaces rationale from the graph, not from LLM inference. | `kernel.queryRationaleChain` RPC (DEEP-01) |
| Inline scripts in webview HTML | VS Code webview CSP nonce pattern requires all scripts to be loaded from `cspSource` URIs, not inline. Adding `<script>` tags in `index.html` will silently fail. | esbuild-bundled `index.js` served from `dist/canvas/` |
| cytoscape WebGL renderer (`options.webgl: true`) | Provisional flag in 3.31+ with documented API-breaking change warnings. Does not support all edge styles (segments edges unsupported). | Default canvas renderer — sufficient for GoatIDE's graph sizes |
| `electron-builder` for the VS Code core build | electron-builder and the VS Code gulpfile build system are mutually exclusive. Adding electron-builder config to `package.json`'s `build` key would conflict with existing gulp tasks. | Separate `electron-builder.yml` file; keep gulp pipeline untouched |

---

## Stack Patterns by Feature Group

**If graph has < 1K nodes (single-file or small repo):**
- Use Cytoscape default canvas renderer with `fcose` layout
- Pan/zoom via default user interaction model
- No performance tuning needed

**If graph has 1K–5K nodes (large repo, DEEP-06 cross-repo stitched):**
- Enable Cytoscape `hideEdgesOnViewport: true` (hides edges during pan/zoom for responsiveness)
- Add a node-type filter toggle to the inspector UI to reduce rendered element count
- Still use canvas renderer (WebGL renderer too unstable at this point in its maturity)

**If auto-update needs testing without a GitHub release:**
- Set `autoUpdater.forceDevUpdateConfig = true`
- Add `dev-app-update.yml` to repo root (gitignored)
- Point at a test GitHub draft release
- Assert this code path is gated behind an explicit env flag, never active in normal dev or CI

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `cytoscape@^3.33.0` | Electron 39 (Chromium 142) | Canvas renderer uses standard 2D canvas API — no Chromium version constraints. WebGL renderer requires `webgl` context support (present in Chromium 142) but is not recommended for v2.0. |
| `cytoscape-fcose@^2.2.0` | `cytoscape@^3.33.0` | Peer dep is `cytoscape >= 3.2`. fcose 2.2 is stable and maintained. |
| `electron-builder@^26.8.1` | Electron 39.8.7 | electron-builder 26.x is the current major. No Electron 39 incompatibilities known. Cross-compile on Windows only (NSIS toolchain is Windows-native; macOS target deferred to v2.1). |
| `electron-updater@^6.8.3` | `electron-builder@^26.8.1` | Must use matching major (both from electron-userland). electron-updater 6.x works with NSIS targets. |
| `electron-updater@^6.8.3` | `VSCODE_DEV=1` | `isUpdaterActive()` returns false in dev mode — safe, but initialize behind a `!process.env.VSCODE_DEV` guard anyway |
| `contributes.walkthroughs` | VS Code API 1.117 | Available since 1.74, fully stable. `when` conditions, step `completionEvents`, and `media.type: 'svg'` all available. |

---

## Sources

- [Cytoscape.js 3.33.0 release notes](https://blog.js.cytoscape.org/2025/07/28/3.33.0-release/) — confirmed current version
- [Cytoscape.js WebGL Renderer Preview](https://blog.js.cytoscape.org/2025/01/13/webgl-preview/) — confirmed WebGL is experimental/provisional, API-breaking changes flagged
- [pkgpulse: Cytoscape.js vs vis-network vs Sigma.js 2026](https://www.pkgpulse.com/blog/cytoscape-vs-vis-network-vs-sigma-graph-visualization-javascript-2026) — download counts, renderer comparison (MEDIUM confidence — third party)
- [electron-builder auto-update docs](https://www.electron.build/auto-update.html) — confirmed Squirrel.Windows deprecated, NSIS is the supported Windows target; `forceDevUpdateConfig` pattern documented
- [electron-builder NSIS docs](https://www.electron.build/nsis.html) — confirmed NSIS channel config, `generateUpdatesFilesForAllChannels`
- [electron-updater npm](https://www.npmjs.com/package/electron-updater) — confirmed current version 6.8.3
- [electron-builder npm](https://www.npmjs.com/package/electron-builder) — confirmed current version 26.8.1
- [VS Code abstractUpdateService.ts](../../../src/vs/platform/update/electron-main/abstractUpdateService.ts) — confirmed `createUpdateURL` signature requires `${updateUrl}/api/update/${platform}/${quality}/${commit}` — Microsoft-controlled endpoint
- [VS Code walkthroughs contribution point](https://code.visualstudio.com/api/ux-guidelines/walkthroughs) — confirmed native API for POLISH-01
- [microsoft/inno-updater GitHub](https://github.com/microsoft/inno-updater) — confirmed it's a Rust helper for the VS Code-specific InnoSetup pipeline, not reusable for GoatIDE without the Microsoft update CDN
- GoatIDE source inspection: `build/gulpfile.vscode.win32.ts`, `src/vs/goatide/extensions/goatide-bridge/src/canvas/webview/index.html` — CSP, InnoSetup pipeline, esbuild config verified directly

---
*Stack research for: GoatIDE v2.0 — deep features + polish + Windows auto-update*
*Researched: 2026-05-13*
