GoatIDE tracks the *session priority* under which architectural decisions were recorded. If your current session priority doesn't match the priority under which a cited DecisionNode was authored, GoatIDE shows an **IntentDrift** badge.

There are two badge variants:

- **Priority Mismatch** — your session priority differs from the one recorded on the DecisionNode
- **Superseded** — the DecisionNode has been invalidated (a successor exists in the graph)

**Important (Mandate D):** IntentDrift is informational. It does not block saves or escalate the tier. It is a signal to review the cited node before proceeding, not a gate.

> **Wave 3 note:** Placeholder copy refined by Plan 17-03.
