#!/usr/bin/env node
// FORK-08 — Validate every recommended-extension ID against Open VSX.
//
// Constitutional mandate: GoatIDE points the IDE at Open VSX. A typo-squat
// in any .vscode/extensions.json `recommendations[]` array would silently
// install the wrong extension at first launch (documented Pitfall 2,
// Jan 2026). This script probes the Open VSX index API for every
// recommended ID and fails the build on any 404 or network error.
//
// Behaviour:
//   - Walks the worktree for every .vscode/extensions.json (skips
//     node_modules, .git, out, dist, .planning).
//   - Parses each manifest's `recommendations` array (default []).
//   - Probes https://open-vsx.org/api/{namespace}/{name} for each ID.
//   - 200      -> ok
//   - non-200  -> failure (typo-squat or removed extension)
//   - network  -> failure (treated as fatal so CI does not silently pass)
//   - malformed id (no `.`) -> failure
//
//   - When zero manifests are found (current Wave-0 state), prints
//     "No extension manifests found, nothing to validate." and exits 0.
//
// Constraints:
//   - No npm dependencies. `node:fs/promises` + global `fetch` only. The
//     script must run from a fresh clone before `npm install`.
//   - 8s per-request timeout via AbortSignal.timeout.
//   - Sequential probing keeps the load on Open VSX polite for the small
//     extension counts expected; switch to bounded parallelism only if
//     manifest counts exceed ~20.
//
// Exit codes:
//   0 — all recommended IDs resolved (or no manifests found)
//   1 — at least one ID failed to resolve
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "out",
  "dist",
  ".planning",
  ".vscode-test",
]);
const REQUEST_TIMEOUT_MS = 8000;
const OPENVSX_API = "https://open-vsx.org/api";

/**
 * Recursively walk `root` and yield every absolute path matching
 * `.vscode/extensions.json`. Skips heavy / irrelevant directories.
 */
async function findExtensionManifests(root) {
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // unreadable dir — skip silently
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        await walk(join(dir, entry.name));
      } else if (
        entry.isFile() &&
        entry.name === "extensions.json" &&
        // canonical: parent dir basename === ".vscode"
        dir.split(/[\\/]/).pop() === ".vscode"
      ) {
        out.push(join(dir, entry.name));
      }
    }
  }
  await walk(root);
  return out;
}

/**
 * Probe a single extension ID. Returns null on success, a failure string
 * on any failure mode (404, network error, timeout, malformed ID).
 */
async function probeExtensionId(manifestPath, id) {
  const trimmed = String(id).trim();
  const dotIdx = trimmed.indexOf(".");
  if (dotIdx <= 0 || dotIdx === trimmed.length - 1) {
    return `${manifestPath}: malformed extension id '${trimmed}'`;
  }
  const namespace = trimmed.slice(0, dotIdx);
  const name = trimmed.slice(dotIdx + 1);
  const url = `${OPENVSX_API}/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`;

  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    return `${manifestPath}: ${trimmed} network error: ${msg}`;
  }
  if (!res.ok) {
    return `${manifestPath}: ${trimmed} not found on Open VSX (HTTP ${res.status})`;
  }
  return null;
}

async function main() {
  const root = process.cwd();
  const manifests = await findExtensionManifests(root);

  if (manifests.length === 0) {
    console.log("No extension manifests found, nothing to validate.");
    return 0;
  }

  const failures = [];
  let totalIds = 0;

  for (const manifestPath of manifests) {
    let parsed;
    try {
      const raw = await readFile(manifestPath, "utf8");
      parsed = JSON.parse(raw);
    } catch (err) {
      failures.push(`${manifestPath}: failed to parse JSON: ${err.message}`);
      continue;
    }
    const recommendations = Array.isArray(parsed?.recommendations)
      ? parsed.recommendations
      : [];
    for (const id of recommendations) {
      totalIds += 1;
      const failure = await probeExtensionId(manifestPath, id);
      if (failure) failures.push(failure);
    }
  }

  if (failures.length === 0) {
    console.log(
      `Validated ${totalIds} extension id(s) across ${manifests.length} manifest(s) — all resolve on Open VSX.`,
    );
    return 0;
  }

  console.log("Open VSX validation failed:");
  for (const f of failures) console.log(`  - ${f}`);
  return 1;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("validate-openvsx.mjs crashed:", err);
    process.exit(1);
  });
