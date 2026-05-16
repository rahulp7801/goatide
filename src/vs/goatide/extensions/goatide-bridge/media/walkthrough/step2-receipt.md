Every save that touches a graph-anchored region produces a Reasoning Receipt — a structured log of which graph nodes were consulted to evaluate your change.

The receipt lists two categories:

- **ConstraintNode** (Explicit confidence) — hard rules recorded in your project's graph. These were authored by a developer who explicitly said "this file must comply with this constraint."
- **DecisionNode** (Inferred confidence) — recorded architectural choices. GoatIDE inferred that your change relates to these decisions based on graph traversal.

Click the **Why?** button next to any citation to open a rationale chain: a depth-first view of how the cited node connects back to your file anchor through the graph.

> **Wave 3 note:** Placeholder copy refined by Plan 17-03.
