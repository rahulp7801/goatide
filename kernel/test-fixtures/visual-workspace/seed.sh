#!/usr/bin/env bash
#
# kernel/test-fixtures/visual-workspace/seed.sh — Phase 11 Plan 11-00 fixture seed driver.
#
# Reads seed-payloads.json + invokes `goatide-cli graph seed --payload-json <tmp>` once per
# entry, capturing the generated ULID from each invocation's stdout {"id":"..."}.
# Then writes a `references` edge from the file-anchored DecisionNode to the ContractNode
# (Open Q 2 resolution: anchor-based edge written via direct dao.writeEdge call).
#
# Required env:
#   TARGET_DB — absolute path to the SQLite graph DB to populate (file will be created).
#
# Optional env:
#   ROOT      — repo root override; defaults to "$(cd "$(dirname "$0")/../../.." && pwd)".
#
# Exit codes: 0 on success, non-zero on any seed/edge failure. set -euo pipefail.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="${ROOT:-$(cd "$SCRIPT_DIR/../../.." && pwd)}"

# Path normalizer: on Git-Bash / MSYS, `pwd` returns POSIX-style /c/... paths that Node
# on Windows cannot resolve as `require()` arguments. Use cygpath -m (forward-slash mixed
# mode) when available; otherwise pass the path through unchanged (native POSIX shells).
nodepath() {
	if command -v cygpath >/dev/null 2>&1; then
		cygpath -m "$1"
	else
		printf '%s' "$1"
	fi
}

if [[ -z "${TARGET_DB:-}" ]]; then
	echo "[seed.sh] error: TARGET_DB env var is required (absolute path to graph.db)" >&2
	exit 1
fi

# Normalize all four paths that Node will see via require()/argv/CLI flags.
ROOT_NODE="$(nodepath "$ROOT")"
TARGET_DB_NODE="$(nodepath "$TARGET_DB")"
SCRIPT_DIR_NODE="$(nodepath "$SCRIPT_DIR")"

CLI_ENTRY="$ROOT/kernel/dist/cli/index.js"
if [[ ! -f "$CLI_ENTRY" ]]; then
	echo "[seed.sh] error: kernel CLI dist not found at $CLI_ENTRY — run \`npm run build\` in kernel/ first" >&2
	exit 1
fi
CLI_ENTRY_NODE="$(nodepath "$CLI_ENTRY")"

# kernel/node_modules/better-sqlite3 is pinned to Electron's ABI (NODE_MODULE_VERSION 140)
# by kernel/scripts/install-electron-prebuild.cjs (Phase 9 BUILD-RT-04). Loading it from a
# system Node 22 (ABI 127) host throws "NODE_MODULE_VERSION 140 vs 127". When the .build
# Electron binary exists we use it via ELECTRON_RUN_AS_NODE=1 so the ABI matches; the
# visual-ceremony harness (Plan 11-00 Task 2) also runs this script as a child of an
# Electron renderer where the same routing is in play.
ELECTRON_BIN_WIN="$ROOT/.build/electron/GoatIDE.exe"
ELECTRON_BIN_DARWIN="$ROOT/.build/electron/GoatIDE.app/Contents/MacOS/GoatIDE"
ELECTRON_BIN_LINUX="$ROOT/.build/electron/goatide"

NODE_RUNNER=""
if [[ -f "$ELECTRON_BIN_WIN" ]]; then
	NODE_RUNNER="$ELECTRON_BIN_WIN"
elif [[ -f "$ELECTRON_BIN_DARWIN" ]]; then
	NODE_RUNNER="$ELECTRON_BIN_DARWIN"
elif [[ -f "$ELECTRON_BIN_LINUX" ]]; then
	NODE_RUNNER="$ELECTRON_BIN_LINUX"
fi

# run_node_abi140 invokes the Electron binary as a Node interpreter via
# ELECTRON_RUN_AS_NODE=1; falls back to plain `node` when no Electron binary is present
# (CI environments that test the seed driver against the pure-system Node ABI must rebuild
# better-sqlite3 first; the harness's launch path always sees a built Electron binary).
run_node_abi140() {
	if [[ -n "$NODE_RUNNER" ]]; then
		ELECTRON_RUN_AS_NODE=1 "$NODE_RUNNER" "$@"
	else
		node "$@"
	fi
}

PAYLOADS_JSON="$SCRIPT_DIR/seed-payloads.json"
if [[ ! -f "$PAYLOADS_JSON" ]]; then
	echo "[seed.sh] error: seed-payloads.json not found at $PAYLOADS_JSON" >&2
	exit 1
fi
PAYLOADS_JSON_NODE="$(nodepath "$PAYLOADS_JSON")"

# Seed each entry. We extract `kind_alias` + `body` + `payload` for each item via node -e
# (jq is not assumed to be installed on dev machines). The payload sub-object is written
# to a temp file and forwarded via --payload-json.
TMP_DIR="$(mktemp -d -t goatide-fixture-seed-XXXXXX)"
TMP_DIR_NODE="$(nodepath "$TMP_DIR")"
trap 'rm -rf "$TMP_DIR"' EXIT

COUNT="$(node -e "console.log(require(process.argv[1]).length)" "$PAYLOADS_JSON_NODE")"
echo "[seed.sh] seeding $COUNT nodes into $TARGET_DB"

declare -A SEEDED_IDS

for i in $(seq 0 $((COUNT - 1))); do
	ENTRY_ID="$(node -e "console.log(require(process.argv[1])[Number(process.argv[2])].id)" "$PAYLOADS_JSON_NODE" "$i")"
	KIND_ALIAS="$(node -e "console.log(require(process.argv[1])[Number(process.argv[2])].kind_alias)" "$PAYLOADS_JSON_NODE" "$i")"
	BODY="$(node -e "console.log(require(process.argv[1])[Number(process.argv[2])].body)" "$PAYLOADS_JSON_NODE" "$i")"
	PAYLOAD_FILE="$TMP_DIR/payload-$i.json"
	PAYLOAD_FILE_NODE="$(nodepath "$PAYLOAD_FILE")"
	node -e "require('node:fs').writeFileSync(process.argv[1], JSON.stringify(require(process.argv[2])[Number(process.argv[3])].payload || {}))" "$PAYLOAD_FILE_NODE" "$PAYLOADS_JSON_NODE" "$i"

	OUT="$(run_node_abi140 "$CLI_ENTRY_NODE" graph seed \
		--kind "$KIND_ALIAS" \
		--body "$BODY" \
		--source 'visual-ceremony-fixture' \
		--actor 'fixture-seed' \
		--db "$TARGET_DB_NODE" \
		--payload-json "$PAYLOAD_FILE_NODE")"

	ULID="$(node -e "console.log(JSON.parse(process.argv[1]).id)" "$OUT")"
	SEEDED_IDS["$ENTRY_ID"]="$ULID"
	echo "[seed.sh]   $ENTRY_ID -> $ULID"
done

CONTRACT_ID="${SEEDED_IDS[contract-auth-security]:-}"
DECISION_ID="${SEEDED_IDS[decision-priority-quality-first]:-}"

if [[ -z "$CONTRACT_ID" || -z "$DECISION_ID" ]]; then
	echo "[seed.sh] error: expected both contract-auth-security and decision-priority-quality-first to seed" >&2
	exit 1
fi

# Open Q 2 resolution: write a `references` edge from the file-anchored DecisionNode
# (anchor file=src/auth/login.ts) to the ContractNode. Phase-3 traversal lights up
# downstream-affected node ripple analysis when VIS-09 surfaces the citation cone.
#
# Direct dao.writeEdge invocation via node -e — the `references` kind is in EDGE_KINDS
# (kernel/src/graph/schema/edges.ts:22). Wrapped in IIFE so we can return non-zero on
# any DAO throw without polluting the parent shell scope.
DAO_ENTRY_NODE="$(nodepath "$ROOT/kernel/dist/graph/index.js")"
run_node_abi140 -e "
const { GraphDAO, openDatabase } = require(process.argv[1]);
const handle = openDatabase(process.argv[2]);
try {
	const dao = new GraphDAO(handle.db);
	const { id } = dao.writeEdge({ kind: 'references', src_id: process.argv[3], dst_id: process.argv[4] });
	console.log('[seed.sh]   edge references ' + process.argv[3] + ' -> ' + process.argv[4] + ' as ' + id);
} finally {
	handle.close();
}
" "$DAO_ENTRY_NODE" "$TARGET_DB_NODE" "$DECISION_ID" "$CONTRACT_ID"

echo "[seed.sh] fixture seed complete"
