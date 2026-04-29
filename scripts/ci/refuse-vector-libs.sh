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
for f in "${FILES[@]}"; do
  [ -f "$f" ] || continue
  for b in "${BANNED[@]}"; do
    # Match the literal `"<name>"` so we hit JSON keys (dependencies block) and lockfile
    # name fields, but never substring matches inside arbitrary prose. The double quotes
    # are part of the search string.
    if rg -q -F "\"$b\"" "$f"; then
      echo "FORK-07 violation — banned vector library '$b' in $f"
      FOUND=1
    fi
  done
done

if [ "$FOUND" -eq 0 ]; then
  echo "FORK-07 ok — no vector libraries in dependency tree."
fi

exit "$FOUND"
