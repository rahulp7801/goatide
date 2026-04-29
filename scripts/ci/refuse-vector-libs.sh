#!/usr/bin/env bash
# FORK-07 — Refuse vector / embedding libraries in the dependency tree.
#
# Constitutional mandate (Mandate C, Scope-Constrained Retrieval): GoatIDE
# uses graph-edge traversal, not vector similarity. Any vector / embedding
# library shipped in package.json or the lockfile is a structural violation.
# This check scans every package.json under git control and the root
# package-lock.json.
#
# The banlist is conservative: it includes the major Node-side vector
# database clients, vector-search SDKs, and embedding-model libraries that
# would tempt a future contributor to bypass Mandate C. New entries are
# added to BANNED below as the ecosystem evolves.
#
# Exit codes:
#   0 — no banned dependency found in any package.json or package-lock.json
#   1 — at least one banned dependency found
set -euo pipefail

BANNED=(
  "hnswlib-node"
  "usearch"
  "faiss"
  "faiss-node"
  "chromadb"
  "@chroma-core/chromadb"
  "pinecone-client"
  "@pinecone-database/pinecone"
  "pgvector"
  "vectordb"
  "lancedb"
  "@lancedb/lancedb"
  "qdrant-client"
  "@qdrant/js-client-rest"
  "weaviate-ts-client"
  "@xenova/transformers"
  "transformers.js"
  "voyageai"
  "bge-base"
  "bge-small"
  "bge-large"
  "ada-002-client"
)

# Files to scan: every tracked package.json (workspace-aware) plus the root lockfile.
# Use `git ls-files` so untracked sentinels from a meta-test are NOT scanned unless
# they have been `git add -N`'d — meta-tests intentionally do this.
#
# NOTE on the filter: we use `grep -E` (POSIX, available on every CI runner
# including Git-Bash-on-Windows) instead of `rg` here because ripgrep on
# Windows mingw refuses to read from a pipe — the same `git ls-files | rg ...`
# idiom that works on Linux/macOS silently drops every line on Windows.
# `rg` is still used below for the content scan inside each file (file-arg
# mode is unaffected by the stdin bug).
mapfile -t FILES < <(git ls-files | grep -E '(^|/)package\.json$|^package-lock\.json$' || true)

FOUND=0

# Filter to only existing files (git ls-files may report tracked-but-deleted entries).
EXISTING=()
for f in "${FILES[@]}"; do
  [ -f "$f" ] && EXISTING+=("$f")
done

# Single rg invocation per banned token across all files. Without this the
# 145-file × 22-token nested loop spawned ~3,190 rg processes and ran > 3 min
# on the post-upstream-merge tree; this collapses it to 22 invocations.
# Match the literal `"<name>"` so we hit JSON keys (dependencies block) and
# lockfile name fields, never substring matches inside arbitrary prose.
if [ "${#EXISTING[@]}" -gt 0 ]; then
  for b in "${BANNED[@]}"; do
    HITS=$(rg --no-heading -F "\"$b\"" "${EXISTING[@]}" 2>/dev/null || true)
    if [ -n "$HITS" ]; then
      echo "FORK-07 violation — banned vector library '$b':"
      echo "$HITS" | head -5
      FOUND=1
    fi
  done
fi

if [ "$FOUND" -eq 0 ]; then
  echo "FORK-07 ok — no vector libraries in dependency tree."
fi

exit "$FOUND"
