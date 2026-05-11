# Auth Security Contract

Phase 11 visual-ceremony fixture — the ContractNode anchored by this file enforces a single
regex pattern that drives VIS-06 (Drift Findings list) and VIS-07 (Override flow).

Two ATX H2 headings below are referenced byte-for-byte in the ContractNode's
`enforcing_sections` array. Pitfall 7 from 11-RESEARCH.md: the array entries are the
heading TEXT only — no leading `##`, no trailing whitespace, case-exact. Adding or
modifying these section names without updating the seed payload will break VIS-09's
section-mismatch detection.

## Authentication

All authentication paths must call `requireAuth(session)` before reading session data.
The drift detector's regex is:

```
function\s+authenticate\w+[^}]*\{(?![^}]*requireAuth)
```

`src/auth/login.ts` complies; `src/auth/login-violations.ts` does not.

## OAuth Scopes

OAuth flows must validate the granted scope against the registered set before issuing
session tokens. This section exists for `enforcing_sections` exact-match coverage; the
fixture does not currently ship a pattern that targets OAuth code paths.

## Notes

This is a non-enforcing section. Edits here do NOT trigger the lock detector
(DRIFT-03). Future fixture changes that need a third enforcing surface should add a
new `## ...` heading here AND extend the seed payload's `enforcing_sections` array.
