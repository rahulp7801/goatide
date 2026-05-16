GoatIDE's save-gate behavior is configurable per workspace. Three settings control the strictness of each tier:

- **`goatide.saveGate.destructive`** — `block` (always reject) or `confirm` (default, require typed phrase). The `suppress` option is intentionally excluded — destructive saves must always surface.
- **`goatide.saveGate.highImpact`** — `block`, `confirm` (default), or `suppress`. Controls saves that touch files in your `contracts.highImpactAllowlist`.
- **`goatide.saveGate.benign`** — `modal` (full Canvas, default), `hover` (compact status-bar notification), or `suppress` (silent accept). Controls UI for low-impact saves.

All three settings are resource-scoped: each workspace folder can override the shared configuration independently, so a monorepo can enforce strict gates on the `packages/core` folder while allowing silent accepts on `docs/`.

[Open settings](command:workbench.action.openSettings?%22%40ext%3Agoatide.goatide-bridge%22)
