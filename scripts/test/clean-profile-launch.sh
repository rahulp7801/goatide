#!/usr/bin/env bash
# scripts/test/clean-profile-launch.sh
#
# FORK-03 — Clean-profile launch smoke test.
#
# Spawns the GoatIDE dev launcher with an isolated --user-data-dir and
# --extensions-dir pointing at fresh tempdirs, asserts the IDE process stays
# alive for at least 10 seconds, then sends SIGTERM and waits for a clean
# exit.
#
# Wave 0 mode: scripts/code.sh / scripts/code.bat does not yet exist (the
# upstream microsoft/vscode tree is not yet cloned). Script must fail loudly
# pointing at Plan 01-03 as the next step.
# Wave 1+ mode: once Plan 01-03 lands the cloned + branded upstream tree, this
# script verifies the IDE actually launches against a hermetic profile.
#
# Reference: 01-RESEARCH.md ## Pitfall 5 — "Clean-profile launch silently
# inherits dev's signed-in state"
# Reference: 01-VALIDATION.md — canonical FORK-03 verification gate
#
# Pitfall 5 mitigation:
#   1. Pass explicit --user-data-dir and --extensions-dir, both pointing at
#      empty tempdirs created here.
#   2. unset VS-Code env vars (VSCODE_DEV / VSCODE_PORTABLE / VSCODE_LOGS /
#      VSCODE_EXTENSIONS) that would override the flags and silently leak the
#      developer's profile state into the test.
#
# Exit codes: 0 = clean launch + clean shutdown. 1 = anything else.
set -euo pipefail

LIVENESS_SEC="${LIVENESS_SEC:-10}"
SHUTDOWN_TIMEOUT_SEC="${SHUTDOWN_TIMEOUT_SEC:-15}"

# --- 1. Platform detection / launcher selection ------------------------------
PLATFORM="$(uname -s)"
case "$PLATFORM" in
  Linux|Darwin)
    LAUNCHER="./scripts/code.sh"
    LAUNCHER_KIND="posix"
    ;;
  MINGW*|MSYS*|CYGWIN*)
    # Git-Bash on Windows. Invoke the .bat through cmd.exe — bash cannot
    # source .bat scripts directly. Use forward-slash path conversion that
    # cmd accepts via `cmd //c`.
    LAUNCHER="./scripts/code.bat"
    LAUNCHER_KIND="windows"
    ;;
  *)
    echo "FORK-03 violation: unsupported platform '$PLATFORM' — only Linux, Darwin, and Windows (MinGW/MSYS/Cygwin) are supported." >&2
    exit 1
    ;;
esac

if [[ ! -f "$LAUNCHER" ]]; then
  echo "FORK-03 violation: launch script not found — upstream tree not yet cloned (Plan 01-03)." >&2
  echo "  Looked for: $LAUNCHER" >&2
  exit 1
fi

# --- 2. Isolated profile dirs (Pitfall 5 #1) ---------------------------------
USER_DATA_DIR="$(mktemp -d)"
EXT_DIR="$(mktemp -d)"
cleanup() {
  # Best-effort: process may already be gone.
  if [[ -n "${LAUNCHER_PID:-}" ]] && kill -0 "$LAUNCHER_PID" 2>/dev/null; then
    kill -KILL "$LAUNCHER_PID" 2>/dev/null || true
  fi
  rm -rf "$USER_DATA_DIR" "$EXT_DIR"
}
trap cleanup EXIT

# --- 3. Sanitize VS-Code env vars (Pitfall 5 #2) -----------------------------
# These would override our --user-data-dir / --extensions-dir flags and silently
# leak the developer's signed-in profile into the test, defeating the purpose.
unset VSCODE_DEV
unset VSCODE_PORTABLE
unset VSCODE_LOGS
unset VSCODE_EXTENSIONS

# --- 4. Spawn the launcher ---------------------------------------------------
echo "FORK-03: launching $LAUNCHER_KIND launcher with user-data-dir=$USER_DATA_DIR ext-dir=$EXT_DIR"
if [[ "$LAUNCHER_KIND" == "posix" ]]; then
  "$LAUNCHER" --user-data-dir="$USER_DATA_DIR" --extensions-dir="$EXT_DIR" &
  LAUNCHER_PID=$!
else
  # Windows: shell out via cmd.exe. The doubled `//c` is git-bash's escape so
  # the literal `/c` reaches cmd.exe instead of being mangled into a path.
  cmd //c "scripts\\code.bat --user-data-dir=$USER_DATA_DIR --extensions-dir=$EXT_DIR" &
  LAUNCHER_PID=$!
fi

# --- 5. Liveness window ------------------------------------------------------
echo "FORK-03: waiting ${LIVENESS_SEC}s for liveness (PID $LAUNCHER_PID)..."
sleep "$LIVENESS_SEC"

if ! kill -0 "$LAUNCHER_PID" 2>/dev/null; then
  echo "FORK-03 violation: GoatIDE died within ${LIVENESS_SEC}s of launch (PID $LAUNCHER_PID gone)" >&2
  exit 1
fi
echo "FORK-03: liveness ok (PID $LAUNCHER_PID still alive after ${LIVENESS_SEC}s)"

# --- 6. Clean shutdown via SIGTERM ------------------------------------------
echo "FORK-03: sending SIGTERM..."
kill -TERM "$LAUNCHER_PID" 2>/dev/null || true

# Wait up to SHUTDOWN_TIMEOUT_SEC, polling every 0.5s.
for _ in $(seq 1 $((SHUTDOWN_TIMEOUT_SEC * 2))); do
  if ! kill -0 "$LAUNCHER_PID" 2>/dev/null; then
    break
  fi
  sleep 0.5
done

if kill -0 "$LAUNCHER_PID" 2>/dev/null; then
  echo "FORK-03 warning: SIGTERM did not stop GoatIDE within ${SHUTDOWN_TIMEOUT_SEC}s; sending SIGKILL" >&2
  kill -KILL "$LAUNCHER_PID" 2>/dev/null || true
  exit 1
fi

echo
echo "FORK-03 ok — GoatIDE launched against clean profile, stayed alive ${LIVENESS_SEC}s, exited cleanly on SIGTERM."
echo "  user_data_dir=$USER_DATA_DIR (will be deleted)"
echo "  extensions_dir=$EXT_DIR (will be deleted)"
exit 0
