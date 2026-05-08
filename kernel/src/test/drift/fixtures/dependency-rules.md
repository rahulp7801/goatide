# Dependency Rules Contract

This contract governs disallowed third-party imports across the entire kernel + bridge
codebase. Plan 07-02 (DRIFT-01) consumes the forbidden_import patterns; Plan 07-03
(DRIFT-03) consumes the enforcing_sections list.

## Forbidden Modules

The following modules MUST NOT be imported anywhere in production code (Mandate C —
no fuzzy matching, no LLM-driven pattern inference):

- `string-similarity` — fuzzy fallback
- `levenshtein` — fuzzy distance
- `fuse.js` — fuzzy search
- `fuzzysort` — fuzzy sort
- `match-sorter` — fuzzy sort
- `@anthropic-ai/sdk` — only allowed in `kernel/src/harvester/promoter/` (the deterministic
  fixture-replay path); forbidden everywhere else.
- `@openai/api` — never, no exceptions.

The detector enforces this via forbidden_import patterns; the refusal gate
`scripts/ci/refuse-fuzzy-pattern-fallback.sh` re-enforces statically (defense-in-depth).

## Notes

This is a non-enforcing section. Future contributors may add commentary here without
risk of triggering the lock.
