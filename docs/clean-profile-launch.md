# Clean-profile launch

GoatIDE's Phase-1 verification (FORK-03) requires launching the IDE against a clean profile — no inherited `.vscode-oss` data, no signed-in MS account, no extensions, no telemetry choice carried over from any other VS Code install. This document is the literal command set per platform.

## Why clean-profile launch matters

Pitfall 5 mitigation. If you launch GoatIDE while environment variables like `VSCODE_DEV`, `VSCODE_PORTABLE`, `VSCODE_LOGS`, or `VSCODE_EXTENSIONS` are set (e.g., from a prior VS Code session), the launched binary will inherit that state and the Phase-1 first-launch verification becomes meaningless: you would be testing against state you didn't intend.

The clean-profile commands below explicitly unset every relevant env var and force `--user-data-dir` and `--extensions-dir` to fresh tempdirs. Each launch is hermetic.

## macOS

```sh
unset VSCODE_DEV VSCODE_PORTABLE VSCODE_LOGS VSCODE_EXTENSIONS
./scripts/code.sh \
  --user-data-dir="$(mktemp -d)" \
  --extensions-dir="$(mktemp -d)"
```

## Linux

Identical to macOS.

```sh
unset VSCODE_DEV VSCODE_PORTABLE VSCODE_LOGS VSCODE_EXTENSIONS
./scripts/code.sh \
  --user-data-dir="$(mktemp -d)" \
  --extensions-dir="$(mktemp -d)"
```

## Windows (PowerShell)

```powershell
Remove-Item Env:VSCODE_DEV         -ErrorAction SilentlyContinue
Remove-Item Env:VSCODE_PORTABLE    -ErrorAction SilentlyContinue
Remove-Item Env:VSCODE_LOGS        -ErrorAction SilentlyContinue
Remove-Item Env:VSCODE_EXTENSIONS  -ErrorAction SilentlyContinue

$userData   = Join-Path $env:TEMP "goatide-clean-$([guid]::NewGuid().Guid)"
$extensions = Join-Path $env:TEMP "goatide-ext-$([guid]::NewGuid().Guid)"
New-Item -ItemType Directory -Path $userData,$extensions | Out-Null

.\scripts\code.bat --user-data-dir="$userData" --extensions-dir="$extensions"
```

## Windows (cmd.exe)

```cmd
set "VSCODE_DEV="
set "VSCODE_PORTABLE="
set "VSCODE_LOGS="
set "VSCODE_EXTENSIONS="

set "USERDATA=%TEMP%\goatide-clean-%RANDOM%%RANDOM%"
set "EXTENSIONS=%TEMP%\goatide-ext-%RANDOM%%RANDOM%"
mkdir "%USERDATA%"
mkdir "%EXTENSIONS%"

scripts\code.bat --user-data-dir="%USERDATA%" --extensions-dir="%EXTENSIONS%"
```

## Expected first-launch behavior

On a clean profile you should see:

- **Telemetry consent dialog** appears on first launch (no inherited consent).
- **No signed-in Microsoft account** in the title bar.
- **Empty extensions panel** (no inherited install state).
- **GoatIDE branding** in the title bar and About dialog (`nameLong="GoatIDE"`).
- **macOS dock identity** is `GoatIDE`, not `Code - OSS`.
- **Windows mutex** is `goatide` (you can launch a separate GoatIDE alongside an upstream Code-OSS install without one stealing the other's instance).

## How to confirm Open VSX is the live source

This is the manual side of the Plan 01-05 verification per `01-VALIDATION.md ## Manual-Only Verifications`.

1. Launch GoatIDE via the clean-profile command for your platform.
2. **Help → Toggle Developer Tools** → switch to the **Network** tab.
3. Open the Extensions panel (`Cmd+Shift+X` / `Ctrl+Shift+X`).
4. Search for `eslint` (or any extension name).
5. Inspect the network requests:
   - **Expected**: requests go to `open-vsx.org` (specifically `https://open-vsx.org/vscode/gallery/...`).
   - **Forbidden**: any request to `marketplace.visualstudio.com`. If you see one, FORK-06's structural enforcement has been bypassed somewhere — investigate immediately.

## Re-runnable verification

The temp directories are hermetic and disposable. Delete them after testing:

```sh
# macOS / Linux
rm -rf "$userData" "$extensions"
```

```powershell
# Windows PowerShell
Remove-Item -Recurse -Force $userData,$extensions
```
