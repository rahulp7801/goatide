# GoatIDE

GoatIDE is a fork of [microsoft/vscode](https://github.com/microsoft/vscode) with constitutional constraints that enforce graph-edge retrieval (no vector embeddings), Open VSX as the sole extension marketplace, fork-isolated GoatIDE code (no edits to `src/vs/workbench/**`), and a monthly upstream-sync ceremony that keeps the fork tractable.

For project context, see [`../PROMPT.md`](../PROMPT.md) (the constitutional mandates) and [`../.planning/ROADMAP.md`](../.planning/ROADMAP.md) (the seven-phase v1 plan).

**v1 status**: dogfood-only research project. No code signing, no notarization, no auto-update. The developer uses GoatIDE as their daily editor from end of Phase 2 onward.

## Prerequisites

Per-platform native build dependencies. Pitfall 7 (toolchain reproducibility) is a real cost — install everything in this list before `npm install`.

### macOS

```sh
xcode-select --install
brew install jq ripgrep
# Node 22+ (use nvm, .nvmrc-respecting)
nvm install
nvm use
```

### Windows

- **Visual Studio 2022 Build Tools** with the **Desktop development with C++** workload (required for native node-gyp dependencies).
- **Python 3.11+** in PATH (`python --version` works from cmd.exe).
- **jq** via `winget install jqlang.jq` (or `choco install jq`, or `scoop install jq`).
- **ripgrep** via `winget install BurntSushi.ripgrep.MSVC` (or `choco install ripgrep`).
- **Node 22+** via [nvm-windows](https://github.com/coreybutler/nvm-windows) honoring `.nvmrc`.
- **PowerShell 7** recommended; some scripts shell out to `cmd.exe` for `.bat` invocations.

### Linux (Debian/Ubuntu)

```sh
sudo apt-get install -y \
  build-essential g++ libx11-dev libxkbfile-dev libsecret-1-dev libkrb5-dev \
  python-is-python3 fakeroot rpm jq ripgrep
# Node 22+ via nvm
nvm install
nvm use
```

## Build

```sh
git clone <fork-url>
cd goatide
git checkout dev
npm install                           # NOT yarn — upstream switched
bash scripts/prepare_goatide.sh       # idempotent; CI runs this too
npm run compile                       # or `npm run watch` for incremental
```

### Launch (development)

```sh
./scripts/code.sh                     # macOS / Linux
.\scripts\code.bat                    # Windows
```

For first launch on a clean profile (no leaked Code-OSS state), see [`clean-profile-launch.md`](./clean-profile-launch.md).

### Build a platform binary

```sh
npm run gulp vscode-darwin-arm64
npm run gulp vscode-darwin-x64
npm run gulp vscode-win32-x64
npm run gulp vscode-win32-arm64
npm run gulp vscode-linux-x64
npm run gulp vscode-linux-arm64
# Append `-min` for minified production builds, e.g. vscode-darwin-arm64-min
```

## CI-local validation

Run before every commit:

```sh
npm run ci-local
```

This runs all four constitutional refusal gates plus the branding assertion:

1. `refuse-marketplace.sh` (FORK-06) — no Microsoft Marketplace references outside `/docs/`
2. `refuse-vector-libs.sh` (FORK-07) — no vector / embedding libraries in dependency tree
3. `refuse-vs-workbench-edits.sh` (FORK-04) — no edits to `src/vs/workbench/**`
4. `validate-openvsx.mjs` (FORK-08) — every recommended extension resolves on Open VSX
5. `assert-product-json-branded.sh` (FORK-02) — `product.json` is GoatIDE-branded

## Upstream sync

Monthly ceremony, see [`upstream-sync.md`](./upstream-sync.md).

```sh
npm run upstream-sync
```

## Constitutional mandates

See [`../PROMPT.md`](../PROMPT.md) §2 for the four mandates. The four refusal gates above are their structural enforcement.

## What NOT to do

- Do not edit `src/vs/workbench/**` — FORK-04 will fail the build. New GoatIDE code goes in `src/vs/goatide/**`.
- Do not add `marketplace.visualstudio.com` references outside `/docs/` — FORK-06 will fail.
- Do not add vector or embedding libraries to `package.json` — FORK-07 will fail. We use graph-edge retrieval per Mandate C.
- Do not add unresolvable Open VSX extension recommendations — FORK-08 will fail.
- Do not regenerate the three Win32 AppId GUIDs in `scripts/prepare_goatide.sh` — they are durable identity for Inno Setup upgrade detection.
