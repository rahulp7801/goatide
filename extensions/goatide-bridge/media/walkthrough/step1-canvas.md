The **Verification Canvas** is GoatIDE's per-save safety net. Every time you save a file that touches a graph-anchored region, the Canvas appears showing:

- The **rationale** for the change — which ConstraintNodes (explicit rules) and DecisionNodes (recorded architectural choices) anchor the affected code
- **Drift findings** — when your save conflicts with a contract or session priority
- The **tier classification**:
  - **Destructive** — requires a typed confirmation phrase before the write proceeds
  - **High-impact** — shows the full Canvas modal
  - **Benign** — shows a compact receipt (configurable via `goatide.saveGate.benign`)

The Canvas is read-only by design: it surfaces what is already in the graph, never inferred or generated text. The cited nodes are the authoritative record of why your file has the shape it does.

When in doubt, read the citations before clicking **Accept**.
