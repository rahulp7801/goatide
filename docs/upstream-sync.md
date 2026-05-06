# Upstream sync ceremony

GoatIDE pins a specific microsoft/vscode release tag (`UPSTREAM_BASE`) and re-bases monthly. This ceremony is structural — the four constitutional gates run on every sync and the ceremony aborts loudly if any of them fail. Pitfall 11 (drift kills forks) is the ever-present cost; the ceremony is the cheapest way to keep the cost amortized.

## Cadence

- Monthly, aligned with microsoft/vscode stable-tag releases.
- Aim for ~30 days between syncs. Skipping a month is fine; skipping two means the next sync is twice as expensive in conflict-resolution cost.

## Pre-flight

Before invoking the ceremony:

- `git status` is clean (working tree fully committed).
- You are on `dev` (or your fork's primary branch).
- `npm run ci-local` is green.

## The ceremony

```sh
npm run upstream-sync
```

The script (`scripts/upstream-sync.sh`) performs:

1. **Source `UPSTREAM_BASE`** — read the current pin (`TAG`, `SHA`, `SYNCED_AT`, `SYNCED_BY`, `POLICY`).
2. **Fetch upstream tags** — `git fetch upstream --tags --quiet`.
3. **Pick the latest stable** — `git ls-remote --tags upstream | grep -E 'refs/tags/[0-9]+\.[0-9]+\.[0-9]+$' | sort -V | tail -n1`. Per `POLICY=most-recent-stable`, the ceremony always selects the highest-semver release tag.
4. **No-op if already current** — exits 0 if `LATEST_TAG == TAG`.
5. **Branch + merge** — creates `upstream-sync-<TAG>` branch and `git merge --no-edit refs/tags/<TAG>`.
6. **Re-run brander** — `./scripts/prepare_goatide.sh` re-applies GoatIDE branding to whatever upstream changed in `product.json` and re-ensures `package.json` has GoatIDE-owned npm scripts (idempotent).
7. **Run all four constitutional gates** — `refuse-vs-workbench-edits.sh` (FORK-04), `refuse-marketplace.sh` (FORK-06), `refuse-vector-libs.sh` (FORK-07), `validate-openvsx.mjs` (FORK-08). Any failure aborts the ceremony.
8. **Brander idempotency assertion** — re-runs the brander and compares SHA-256 of `product.json` and `package.json`. If they differ, upstream introduced a new field that the brander doesn't yet know about; manual review required.
9. **Write new `UPSTREAM_BASE`** — TAG, 40-char SHA, ISO-8601 timestamp, sync user, policy.
10. **Commit** — `chore(upstream): sync to <TAG>`. Ceremony then prints "Open a PR to dev."

## Conflict resolution rules

### `src/vs/workbench/**`

**Should never conflict** — GoatIDE owns no files there. If a conflict appears, someone snuck a workbench edit in; revert that edit. The FORK-04 gate would have caught this on the previous PR; investigate.

### `product.json`

Take upstream's version of every field NOT in the brander's owned set; the brander re-applies GoatIDE's owned fields automatically. If upstream introduces a new field with the same name as a GoatIDE-owned field, escalate (likely needs brander update).

Brander-owned fields (`scripts/prepare_goatide.sh`):
`nameShort`, `nameLong`, `applicationName`, `dataFolderName`, `win32MutexName`, `darwinBundleIdentifier`, `win32DirName`, `win32NameVersion`, `win32RegValueName`, `win32AppId`, `win32x64AppId`, `win32arm64AppId`, `urlProtocol`, `extensionsGallery`.

### `package.json`

Take upstream's version. Then re-run `bash scripts/prepare_goatide.sh` — it re-adds the GoatIDE-owned npm scripts (`upstream-sync`, `ci-local`) idempotently.

### `.gitattributes`

Keep both rule sets. GoatIDE's specific rules (`*.sh text eol=lf`, etc.) come first so they win on overlap.

### `src/vs/code/electron-main/app.ts`

The kernel-spawn hook (added in Plan 01-04) is the ONE allowlisted edit under `src/vs/**`. If it conflicts, manually merge — preserve the GoatIDE `spawnKernel()` call while accepting upstream's surrounding changes.

### Any other `src/vs/**`

Take upstream's. All other `src/vs/**` files are upstream-owned.

## What if a gate fails post-merge

### FORK-04 fails

A GoatIDE-authored edit drifted into the upstream tree. Revert it from the merge branch and PR-fix the original commit on `dev`.

### FORK-06 fails (marketplace references found outside `/docs/`)

Upstream has a NEW reference to `marketplace.visualstudio.com` somewhere outside `/docs/`. Two paths:

- **If the file is upstream-owned doc/changelog/contributing/test-fixture content** (e.g., `*/CHANGELOG.md`, `*/CONTRIBUTING.md`, `cli/CONTRIBUTING.md`, `extensions/copilot/CHANGELOG.md`, `build/lib/test/fixtures/**`): widen `refuse-marketplace.sh`'s exclusion list with a per-path `--glob '!path/to/file'` entry, with the rationale documented inline as a script comment. This is allowed because the file does not affect runtime behavior.
- **If the file is in `build/rspack/` or `build/vite/` (workbench HTML templates with hardcoded gallery URLs), or in `src/vs/workbench/**`**: STOP. Investigate. These represent functional pointers at marketplace, not just doc references. Surface as a research-flag in the upstream-sync PR description and decide on a per-case basis (typically: patch the hardcoded URL via a new brander step, NOT a glob exclusion).

### FORK-07 fails

Upstream added a vector or embedding library. **This is a constitutional crisis** — Mandate C is non-negotiable. Investigate before the merge ships:

- Is the library a transitive dependency? If so, contact maintainer of the direct dependency.
- Is the library a direct dependency of an upstream-bundled extension? Consider unbundling that extension (Phase 2+ scope).
- If genuinely required by core, escalate to project decision (likely fork-and-vendor the upstream module that introduces it).

### FORK-08 fails (Open VSX validation)

A recommended-extension ID does not resolve on Open VSX (HTTP 404 from `https://open-vsx.org/api/<publisher>/<name>`). Two paths:

- **If the unresolvable extension is upstream-recommended in `extensions/*/​.vscode/extensions.json`**: this is upstream's recommendation, not GoatIDE's. Either (a) wait for the publisher to register on Open VSX, (b) remove the recommendation from the upstream-merged file (locally branch this off into `src/vs/goatide/` if it's worth keeping the metadata), or (c) widen the validator's allowlist with rationale (NOT preferred).
- **If the unresolvable extension is in `.vscode/extensions.json` at root** (developer-tooling recommendations): clean it up; it's developer experience, not user-facing.

## Known Phase-1 escalations

After Phase-1 first-merge of `1.117.0`, these gate failures were observed and require checker-iteration handling rather than blind exclusion-widening:

- **FORK-06**: marketplace references in `cli/CONTRIBUTING.md`, `extensions/copilot/CHANGELOG.md`, `extensions/theme-seti/CONTRIBUTING.md`, `README.md` (root), `build/lib/test/fixtures/policies/{darwin,win32}/fr-fr/*`, `build/lib/test/policyConversion.test.ts`, `build/rspack/workbench-rspack.html`, `build/vite/workbench-vite.html`, `src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts`. The `build/rspack` and `build/vite` HTML templates need real review (they bake `marketplace.visualstudio.com` into `extensionsGallery` configs); the rest are doc-style references.
- **FORK-08**: upstream `extensions/copilot/.vscode/extensions.json` recommends six MS-internal extensions (`connor4312.esbuild-problem-matchers`, `ms-vscode.extension-test-runner`, `ms-vscode.debug-value-editor`, `ms-vscode.web-editors`, `ms-vscode.visualization-runner`, `ms-vscode.ts-file-path-support`) that do not exist on Open VSX. Root `.vscode/extensions.json` uses JSONC (with comments) and the validator's strict-JSON parser fails on it.

These are Phase-1 research flags, surfaced for downstream resolution by a planned `1.x` checker iteration.

## Phase 1.1 — TypeScript pin override (build-toolchain escalation closure)

Phase 1 surfaced a TypeScript-version vs. vscode 1.117.0 `.d.ts` conflict
(`01-05-phase-verify-evidence.md ## Build-Toolchain Escalation`, issue #4):
`typescript@6.0.2` rejects vscode 1.117.0's `vscode.d.ts` with duplicate-
index-signature errors at lines 6, 4530, 6950, 8861, 16716. The Phase 1.1
resolution pins TypeScript at `~5.9.0` via root `package.json`'s
`overrides` block (Lane A from `01.1-RESEARCH.md ## Architecture Patterns
> Pattern 1`). The pin is preserved across upstream-sync by
`scripts/prepare_goatide.sh` — see the package.json drift-recovery jq
extended in Plan 01.1-02.

On every upstream-sync, after the merge, `prepare_goatide.sh` will:
  1. Restore the GoatIDE-owned npm scripts.
  2. Restore `devDependencies.typescript = "~5.9.0"` and
     `overrides.typescript = "~5.9.0"`.

**Reverification command (run after every monthly sync):**

```sh
bash scripts/test/brander-asserts-pin-meta.sh    # exits 0 = brander still preserves pin
bash scripts/test/upstream-sync-dryrun.sh        # exits 0 = full FORK-05 ceremony intact
npm install                                       # re-resolves to ~5.9.x
node -p "require('./node_modules/typescript/package.json').version"  # must start with 5.9.
```

**Reconsider this pin at every monthly upstream-sync:** if the new
`UPSTREAM_BASE.TAG` points at a vscode 1.118+ that no longer uses
`[key: string]: any` in those 5 .d.ts spots, the override may be removable.
Verify before deleting by removing the overrides entry and re-running
`npm run compile-check-ts-native`.

## Phase 1.1 — FORK-06 closure (HTML brander + per-file allowlist)

Phase 1 surfaced FORK-06 RED on 13 hits across 7 file categories
(`01-05-phase-verify-evidence.md ## Known Phase-1 Escalations > FORK-06`).
Phase 1.1 closes the escalation in two parts:

### Part A — Brand the HTML lane

The HIGH-risk hits in `build/rspack/workbench-rspack.html` and
`build/vite/workbench-vite.html` (which bake hardcoded
`marketplace.visualstudio.com` URLs into the rendered workbench HTML)
are now rewritten by `scripts/prepare_goatide.sh` on every run. The
brander uses `sed -i` with longest-match-first ordering on five URL
mappings (verified in `01.1-RESEARCH.md ## Code Examples > Example 2`):

  - `marketplace.visualstudio.com/_apis/public/gallery/searchrelevancy/extensionquery` -> `open-vsx.org/vscode/gallery/search`
  - `marketplace.visualstudio.com/_apis/public/gallery` -> `open-vsx.org/vscode/gallery`
  - `marketplace.visualstudio.com/items` -> `open-vsx.org/vscode/item`
  - `marketplace.visualstudio.com/publishers` -> `open-vsx.org/vscode/publisher`
  - `marketplace.vsallin.net/_apis/public/gallery` -> `open-vsx.org/vscode/gallery`

The rewritten URLs match what `product.json`'s `extensionsGallery`
already points at, so the IDE binary's runtime config and the
dev-server fixtures are now consistent.

**Pitfall 5 caveat:** `npm run serve-out-rspack` and `npm run vite dev`
(upstream-only dev-server commands) may 404 on the rewritten Open VSX
URLs because marketplace's path shape does not 1:1 match Open VSX. The
GoatIDE developer never invokes those commands; the shipped binary is
unaffected. Documented for future contributors.

### Part B — Per-file allowlist with rationale

The remaining 5 file categories are not runtime config — they are
example/fixture/translation strings. They are allowlisted in
`scripts/ci/refuse-marketplace.sh` with per-glob rationale:

| Category | Files | Rationale |
|---|---|---|
| Doc/changelog | `cli/CONTRIBUTING.md`, `extensions/copilot/CHANGELOG.md`, `extensions/theme-seti/CONTRIBUTING.md`, `README.md` | Informational text, not runtime config |
| French policy fixtures | `build/lib/test/fixtures/policies/{darwin,win32}/fr-fr/*`, `build/lib/test/policyConversion.test.ts` | French YOLO-mode warning translation; not user-facing |
| English YOLO-mode warning | `src/vs/workbench/contrib/chat/browser/tools/languageModelToolsService.ts` | String literal mentions Dev Containers extension URL as compromise example |

Two additional self-reference allowlist entries surfaced during
implementation: `scripts/test/upstream-sync-dryrun.sh` (comment block
documenting the FORK-06 brander rationale) and
`scripts/prepare_goatide.sh` (the brander itself contains the source
pattern as the LHS of the sed rewrite expressions; without it the
gate could never go GREEN). Both have inline-comment rationale in
`refuse-marketplace.sh`.

### Reverification command (run after every monthly sync)

```
bash scripts/prepare_goatide.sh   # idempotently re-brands HTMLs
git diff --quiet build/rspack/workbench-rspack.html build/vite/workbench-vite.html
bash scripts/ci/refuse-marketplace.sh   # exits 0
bash scripts/test/refusal-marketplace-meta.sh   # exits 0
bash scripts/test/upstream-sync-dryrun.sh   # exits 0; HTML idempotency assertion is GREEN
```

If a future upstream-sync introduces a NEW marketplace reference outside
the allowlisted categories, refuse-marketplace.sh will fail loudly with
the file path. Brand it (preferred) or extend the allowlist with new
rationale (only as last resort).

## Phase 1.1 — FORK-08 closure (Open VSX delta)

Phase 1 surfaced FORK-08 RED on two issues (`01-05-phase-verify-evidence.md
## Known Phase-1 Escalations > FORK-08`):

  1. JSONC parse failure on `.vscode/extensions.json` files with `//` comments
     (`scripts/validate-openvsx.mjs`'s strict `JSON.parse` threw SyntaxError on
     the `// See https://go.microsoft.com/fwlink/?LinkId=827846` line at the
     top of root `.vscode/extensions.json`).
  2. Six `ms-vscode.*` / `connor4312.*` extension IDs in
     `extensions/copilot/.vscode/extensions.json` not on Open VSX (HTTP 404)
     plus four additional 404 IDs in root `.vscode/extensions.json`.

Phase 1.1 closes both:

### Part A — JSONC tolerance

`scripts/validate-openvsx.mjs` strips line comments via the regex
`raw.replace(/^\s*\/\/.*$/gm, '')` before `JSON.parse`. Preserves the
script's no-npm-deps contract (`node:fs/promises` + global `fetch` only).
Block comments (`/* ... */`) and inline comments (after a value) are NOT
supported — verified live in the GoatIDE tree: only line comments at
line-start position appear in any `.vscode/extensions.json` file we
manage. If a future upstream-sync introduces a manifest with block
comments, the validator will raise a JSON parse error with the file
path; widen the regex (or pull in `jsonc-parser` if the cost-benefit
flips) at that point, not preemptively.

### Part B — Per-extension decisions (live Open VSX probe, 2026-05-01)

Per-extension decisions are removal-with-rationale, not allowlist-with-
rationale: the whole point of FORK-08 is to refuse typo-squat regressions.
Allowlisting an unresolvable ID would let real regressions through. The
6+4 IDs below are upstream-developer-tooling that the GoatIDE dogfood
developer does not need; the `recommendations` array is a workspace-
setup hint for first-time VS Code workspace open, not a runtime
dependency (Pitfall 6 verified in Part C below).

| ID | File | Open VSX status | Decision | Rationale |
|---|---|---|---|---|
| connor4312.esbuild-problem-matchers | `extensions/copilot/.vscode/extensions.json` | 404 (live probe 2026-05-01) | Removed | Upstream-developer-tooling for esbuild problem-matchers; not user-facing |
| ms-vscode.extension-test-runner | `extensions/copilot/.vscode/extensions.json` AND `.vscode/extensions.json` | 404 (live probe 2026-05-01) | Removed from both | Upstream tooling for VS Code extension tests; goatide kernel has its own test infra (vitest, kernel/) and Phase 4 bridge will have its own runner |
| ms-vscode.debug-value-editor | `extensions/copilot/.vscode/extensions.json` | 404 (live probe 2026-05-01) | Removed | Upstream developer-tooling for debugging VS Code internals |
| ms-vscode.web-editors | `extensions/copilot/.vscode/extensions.json` | 404 (live probe 2026-05-01) | Removed | Upstream tooling for web editor development |
| ms-vscode.visualization-runner | `extensions/copilot/.vscode/extensions.json` | 404 (live probe 2026-05-01) | Removed | Upstream developer-tooling |
| ms-vscode.ts-file-path-support | `extensions/copilot/.vscode/extensions.json` | 404 (live probe 2026-05-01) | Removed | Upstream tooling |
| jrieken.vscode-pr-pinger | `.vscode/extensions.json` | 404 (live probe 2026-05-01) | Removed | Internal Microsoft developer tool (Jonas Rieken's PR pinger); not on Open VSX |
| typescriptteam.native-preview | `.vscode/extensions.json` | 404 (live probe 2026-05-01) | Removed | TypeScript team internal preview build of TS native (Go) port; not on Open VSX |
| ms-vscode.ts-customized-language-service | `.vscode/extensions.json` | 404 (live probe 2026-05-01) | Removed | Internal MS TS language service variant; not on Open VSX |
| dbaeumer.vscode-eslint | both | 200 (live probe 2026-05-01) | Kept | Standard ESLint extension; available on Open VSX |
| editorconfig.editorconfig | `.vscode/extensions.json` | 200 (live probe 2026-05-01) | Kept | Standard EditorConfig extension; available on Open VSX |
| github.vscode-pull-request-github | `.vscode/extensions.json` | 200 (live probe 2026-05-01) | Kept | GitHub PR extension; available on Open VSX |
| ms-vscode.vscode-github-issue-notebooks | `.vscode/extensions.json` | 200 (live probe 2026-05-01) | Kept | Available on Open VSX (verified live; planner had flagged for verification) |
| esbenp.prettier-vscode | `extensions/copilot/.vscode/extensions.json` | 200 (live probe 2026-05-01) | Kept | Standard Prettier extension; available on Open VSX |
| vitest.explorer | `extensions/copilot/.vscode/extensions.json` | 200 (live probe 2026-05-01) | Kept | Vitest test explorer; available on Open VSX |
| charliermarsh.ruff | `extensions/copilot/.vscode/extensions.json` | 200 (live probe 2026-05-01) | Kept | Python Ruff linter; available on Open VSX |

After removals: `extensions/copilot/.vscode/extensions.json`
recommendations[] = 4 IDs (eslint, prettier, vitest, ruff). Root
`.vscode/extensions.json` recommendations[] = 4 IDs (eslint,
editorconfig, github-pr, github-issue-notebooks). All 8 IDs across the
2 manifests resolve on Open VSX (validator exit 0).

### Part C — Pitfall 6 mitigation (Open Question 2)

Verified `extensions/copilot/package.json`'s `scripts.test`
(`"npm-run-all test:*"`) and the full `devDependencies` (93 keys) +
`dependencies` (44 keys) blocks do NOT reference any of the 6 removed
IDs. The recommendations are workspace-setup hints for first-time VS
Code workspace open, not runtime requirements. Removal does not break
the copilot test suite.

### Reverification command (run after every monthly sync)

```sh
node scripts/validate-openvsx.mjs              # exits 0 = FORK-08 GREEN
bash scripts/test/refusal-openvsx-meta.sh      # exits 0 = refusal still fires + clears
```

If a future upstream-sync re-introduces a 404 ID into either
`extensions/*/.vscode/extensions.json` or root `.vscode/extensions.json`,
the validator will fail loudly with the exact ID and HTTP status.
Decide per-extension (remove vs allowlist with rationale) and append a
new row to the table above. Allowlisting should be the rare path —
removal preserves the typo-squat refusal value.

## Phase 1.2 — LFS push-ability strategy: GitHub fork

### Decision

GoatIDE's origin (`rahulp7801/goatide`) is a GitHub fork of `microsoft/vscode`. This is a structural choice that resolves the GH008 LFS pre-receive blocker by leveraging GitHub's fork-network LFS storage sharing — pushed commits referencing upstream LFS pointers (test fixtures: `extensions/copilot/test/simulation/cache/**/*.sqlite`, `test/componentFixtures/.screenshots/baseline/**`) resolve via the parent's LFS storage rather than requiring duplicate uploads to the fork's own storage.

### Why this path (vs. the three alternatives evaluated in `.planning/phases/01.2-.../01.2-RESEARCH.md`)

- **Path 1 (fetch+push upstream LFS data):** Multi-GB per upstream-sync; eats into the user's free 10 GB monthly LFS bandwidth quota; recurring tax.
- **Path 2 (`git lfs migrate export` blanket):** Rewrites all 1.95M reachable commits; breaks upstream-sync diffability; destructive.
- **Path 3 (hybrid scoped migrate-export):** Same destructive rewrite, scoped to two upstream-only path families; reversible via `--object-map`; but recurring (must be re-applied on every monthly upstream-sync); the regression-detection meta-test adds permanent surface area.
- **Path F (this — GitHub fork):** Zero local destructive work; LFS evaporates as a problem; upstream-sync is structurally simpler (`gh` CLI's "Sync fork" flow is available alongside the existing `scripts/upstream-sync.sh`); no recurring tax. Tradeoff: origin is PUBLIC (GitHub forks of public repos are public by default), and the fork relationship is visible on the user's GitHub profile. Accepted for a research-thesis dogfood project where the codebase will be publicly shareable anyway.

### What changed structurally

- `rahulp7801/goatide` is now a fork of `microsoft/vscode` (created 2026-05-06 via `gh repo fork microsoft/vscode --fork-name=goatide`).
- The previous empty private `rahulp7801/goatide` was renamed to `rahulp7801/goatide-private-archive` to free the name; it can be deleted at any time.
- Local `origin` URL unchanged (still `https://github.com/rahulp7801/goatide.git`); the fork takeover was transparent at the git remote level.
- The fork's default branch is `main` (inherited from upstream); GoatIDE work pushes to `master` (matches the `[master]` trigger in `.github/workflows/ci.yml`). Both branches coexist; `main` tracks upstream, `master` is the GoatIDE delta.

### Detach-time considerations (future)

If the fork relationship is ever severed (via GitHub Settings → "Leave fork network" or GitHub Support), the LFS sharing benefit goes away. At that point the chosen path becomes one of:
1. Pay for LFS storage on the detached repo (multi-GB upload).
2. Run `git lfs migrate export` to scrub upstream-only LFS pointers from history (the deferred destructive work).
3. Accept broken LFS smudge for cloners (cosmetic).

This is not a near-term concern. The fork is the correct primitive for the current research-thesis stage.

### Reverification command (run after every monthly sync)

```sh
git push origin master --dry-run         # exits 0 = LFS pointers resolve via fork network
gh run list --limit 1                     # CI matrix triggered on push
```

If a future upstream-sync introduces a NEW LFS-tracked path that the fork-network mechanism cannot resolve (e.g., the user detaches the fork, or upstream's LFS storage moves), `git push --dry-run` will report the missing pointers verbatim and the fix becomes: re-run `gh repo sync` or fall back to one of Paths 1-3 above.
