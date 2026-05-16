GoatIDE's save-gate behavior is configurable per workspace. Three settings control strictness:

- **`goatide.saveGate.destructive`** — `block` or `confirm` (default). Destructive saves always require explicit confirmation; the `suppress` option is intentionally excluded (Mandate D).
- **`goatide.saveGate.highImpact`** — `block`, `confirm` (default), or `suppress`. Controls saves that touch files in your `contracts.highImpactAllowlist`.
- **`goatide.saveGate.benign`** — `modal` (default), `hover`, or `suppress`. Controls UI for low-impact saves: full Canvas, compact status-bar hover, or silent accept.

[Open settings](command:workbench.action.openSettings?%22%40ext%3Agoatide.goatide-bridge%22)

> **Wave 3 note:** Placeholder copy refined by Plan 17-03.
