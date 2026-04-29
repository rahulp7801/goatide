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
