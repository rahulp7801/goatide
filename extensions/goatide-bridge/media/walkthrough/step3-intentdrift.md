GoatIDE tracks the *session priority* under which architectural decisions were recorded. If your current session priority differs from the one a cited DecisionNode was authored under, GoatIDE shows an **IntentDrift** badge on that citation.

There are two badge variants:

- **Priority Mismatch** — your active session priority differs from the priority recorded on the DecisionNode (e.g., you are working under `Speed-First` but the node was captured under `Safety-First`)
- **Superseded** — the DecisionNode was invalidated; a successor node exists in the graph

**Important:** IntentDrift is informational only. It does not block saves or escalate the tier. It is a signal to review the cited node before proceeding — not a gate. The save always proceeds when you click Accept.
