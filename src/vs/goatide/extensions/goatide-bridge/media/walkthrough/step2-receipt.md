Every save that touches a graph-anchored region produces a **Reasoning Receipt** — a structured record of which graph nodes were consulted to evaluate your change.

The receipt lists two citation categories:

- **ConstraintNode** (Explicit confidence) — hard rules recorded in your project's graph. Authored by a developer who explicitly wrote: "this file must comply with this constraint."
- **DecisionNode** (Inferred confidence) — recorded architectural choices. GoatIDE inferred that your change relates to these decisions based on graph traversal.

Click the **Why?** button next to any citation to open the **rationale chain**: a depth-first view tracing how the cited node connects back to your file anchor through the graph. The chain is anchored to the exact snapshot timestamp of your save — it never drifts forward in time.

If the Canvas is empty (no citations), you can add your first DecisionNode using the **Add DecisionNode** button.
