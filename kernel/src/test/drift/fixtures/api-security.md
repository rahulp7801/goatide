# API Security Contract

This contract governs authentication and authorization for all HTTP routes under
`src/app/api/**/*.ts`. Plan 07-02 (DRIFT-01) consumes the regex pattern; Plan 07-03
(DRIFT-03) consumes the enforcing_sections list.

## Authentication

All routes MUST call `requireAuth()` before any business logic. The detector enforces
this via a regex pattern with required:true.

```ts
// CORRECT:
export async function GET(req: Request) {
  await requireAuth(req);
  // ... business logic
}
```

## OAuth Scopes

The minimum scopes required for first-party routes are `openid`, `profile`, and `email`.
Routes MAY request additional scopes — but never fewer.

## Notes

This is a non-enforcing section. Cosmetic edits here (typo fixes, clarifications) do
NOT trigger the lock detector. Plan 07-03 verifies this by adjusting words in this
section and asserting no LockTrigger fires.
