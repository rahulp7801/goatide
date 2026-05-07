#!/usr/bin/env bash
# scripts/ci/refuse-credential-leaks-in-fixtures.sh
# Phase 5 (Plan 05-01) — Credential-leak refusal gate over recorded LLM fixtures.
#
# Pre-empts Pitfall 7 (.planning/phases/05-telemetry-harvester-portability-filter/05-RESEARCH.md):
# Anthropic.MessagesResponse.id, HTTP debug headers, or accidentally-pasted dev shell
# secrets ending up in committed fixtures. Modeled on scripts/ci/refuse-vector-libs.sh.
#
# Exit codes:
#   0 — no banned credential pattern found in any scanned fixture file
#   1 — at least one banned pattern found
set -euo pipefail

SCAN_GLOBS=(
	"kernel/src/test/harvester/promoter/fixtures"
	"src/vs/goatide/extensions/goatide-bridge/test/fixtures"
)

# Patterns are anchored by either a literal token (Authorization header value, sk-ant-
# Anthropic key prefix, AWS_SECRET_ACCESS_KEY env var name) or a regex shape (AWS access
# key AKIA + 16 alphanum, GitHub fine-grained tokens gh[poushr]_ + 36 chars, JWT
# eyJ-prefixed dot-segment).
PATTERNS=(
	'Authorization:'
	'Authorization":'
	'Bearer '
	'sk-ant-'
	'AKIA[A-Z0-9]{16}'
	'gh[poushr]_[A-Za-z0-9]{36}'
	'eyJ[A-Za-z0-9_=-]{10,}\.[A-Za-z0-9_=-]{10,}'
	'AWS_SECRET_ACCESS_KEY='
)

FAIL=0
for dir in "${SCAN_GLOBS[@]}"; do
	if [[ ! -d "$dir" ]]; then
		continue
	fi
	for pattern in "${PATTERNS[@]}"; do
		# Recursive match against any file in the fixtures dir. We use grep -E (POSIX)
		# instead of rg here because Windows mingw-rg silently drops piped stdin (the
		# refuse-vector-libs.sh footgun); file-arg recursion is safe across runners.
		MATCHES=$(grep -rEln "$pattern" "$dir" 2>/dev/null || true)
		if [[ -n "$MATCHES" ]]; then
			echo "FAIL: forbidden credential pattern '$pattern' found in:" >&2
			echo "$MATCHES" >&2
			FAIL=1
		fi
	done
done

if [[ $FAIL -eq 1 ]]; then
	echo "" >&2
	echo "Refuse-credential-leaks gate FAILED. Recorded LLM fixtures must not contain bearer tokens, AWS/GitHub/JWT shapes, or session credentials." >&2
	exit 1
fi
echo "refuse-credential-leaks-in-fixtures: OK"
