# GoatIDE

## What This Is

GoatIDE is an agent-native IDE — a fork of VS Code that adds an orchestration kernel
managing a persistent "Company Brain": a bitemporal SQLite graph of every engineering
decision, rule, and constraint observed across sessions. It eliminates context decay
and verification friction by harvesting intent automatically (zero-tax) and gating
every change behind a Reasoning Receipt that cites the rules it relied on. Built as
a research/portfolio project for a single developer.

## Core Value

A developer never re-explains a decision: every rule learned in one session is
automatically captured, anchored in the graph, and enforced — with provenance — on
all future changes.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Fork VS Code (Code OSS) and run it as the editor surface
- [ ] Embed the GoatIDE Kernel (orchestration + graph manager) inside the IDE process
- [ ] SQLite-backed bitemporal graph with `valid_from` / `invalidated_at` fields and supersession-only history
- [ ] Typed nodes only: `ConstraintNode`, `DecisionNode`, `ContractNode`, `OpenQuestion`, `Attempt`
- [ ] Confidence scoring on every node: `Explicit` (human-authored) vs `Inferred` (agent-distilled)
- [ ] Telemetry harvester observing four sources: Claude Code transcript JSONL, editor events (save/edit/cursor), terminal/shell events, git operations
- [ ] Portability check pipeline: every observation tested for portable / net-new / project-relevant / verifiable / justified before promotion to candidate node
- [ ] Graph-edge traversal retrieval (Parents / Siblings / References scope) — naive vector-similarity search forbidden
- [ ] Reasoning Receipt: structured citation chain showing which graph nodes dictated a change
- [ ] Verification Canvas: modal review pane that gates every change with the Reasoning Receipt and a "Why was this done?" drill-down before accept
- [ ] Human-confirmation gate on destructive actions (delete / drop / revert)
- [ ] Intent Drift detection: scan diffs for violations of structural patterns (API schemas, design tokens) and surface in sidebar pre-merge
- [ ] Supersession logic on rule conflict: evaluate intent (not keywords); flag IntentDrift when current priority differs from priority a rule was derived under
- [ ] Contract locking: protected contracts (e.g. `/contracts/api_security.md`) lock on edit and produce a Compliance-as-Code ripple-effect report
- [ ] Consume four external MCP servers: GitHub, Slack, Linear, Jira — treated as active memory nodes
- [ ] Expose GoatIDE's graph as an MCP server (bidirectional) — other agents can query the Company Brain
- [ ] Cross-session compounding: a rule registered in one session is immediately globally available to all agents/sessions
- [ ] Ledger discipline: the graph stores only typed nodes — no conversational meta ("I have finished the task")

### Out of Scope

- Cloud hosting / SaaS deployment — local-only IDE; the graph lives on the developer's machine
- Naive vector-similarity retrieval — explicitly forbidden by Mandate C; graph-edge traversal only
- Manual decision-documentation prompts — explicitly forbidden by Mandate A (zero-tax)
- Deletion of graph history — only supersession, never delete (Mandate B)
- Building an editor from scratch — VS Code fork is the editor surface

## Context

- **Research / portfolio project** — single developer, no hard deadline, depth over breadth.
  Goal is to land the full constitutional thesis in v1, not an MVP shaped by ship pressure.
- **PROMPT.md** in the repo root is the canonical vision document (the "Constitutional Mandate")
  and is the source of truth for kernel behavior.
- **VS Code fork as base** — inherits LSP, debugger, extension ecosystem; we add the kernel
  and Verification Canvas as built-in surfaces, not as an extension.
- **MCP-first orchestration** — the kernel does not embed integrations; it speaks MCP. The
  same MCP server interface is used for both consumed integrations (GitHub/Slack/Linear/Jira)
  and the exposed graph server.
- **Bitemporal graph** is the system's spine. Every other feature (receipts, drift detection,
  contract locking) depends on graph fidelity.
- **No multi-user collaboration** is committed for v1, but the architecture should not preclude
  a future shared-graph milestone.

## Constraints

- **Tech stack**: TypeScript + Electron — matches VS Code's native stack; required to fork and extend it
- **Editor base**: Fork of Code OSS (VS Code) — locked; not building an editor from scratch
- **Storage**: SQLite for the bitemporal graph — embedded, local, file-based. No external DB in v1
- **Retrieval**: Graph-edge traversal only — naive vector-similarity is constitutionally forbidden
- **Persistence**: Local-only — no cloud, no SaaS, no shared backend in v1
- **History**: Append-only / supersession-only — graph history may not be deleted
- **Telemetry**: Zero-tax — no manual documentation prompts to the developer, ever
- **Integration model**: MCP-first — all external services connected via MCP, never bespoke clients
- **Ledger purity**: Only typed nodes (`constraint`, `decision`, `open_question`, `attempt`, `contract`) — no conversational meta

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Fork VS Code (Code OSS) rather than wrap Monaco or build from scratch | Inherits LSP, debugger, extension ecosystem; fastest path to a real IDE that real engineers can use | — Pending |
| TypeScript + Electron stack | Matches VS Code's native stack; no friction extending the fork | — Pending |
| SQLite for the bitemporal graph | Local, embedded, file-based; aligns with local-only constraint and avoids ops burden | — Pending |
| Graph-edge traversal over vector similarity | Constitutional Mandate C: scope-constrained retrieval requires structural traversal, not statistical similarity | — Pending |
| Verification Canvas as a modal review pane (not sidebar / inline) | Forces explicit human accept on every change; matches Verification-First Mandate D | — Pending |
| Consume four MCPs (GitHub + Slack + Linear + Jira) in v1 | Research/portfolio context allows breadth; each adds distinct memory surface | — Pending |
| Expose GoatIDE's graph as an MCP server (bidirectional) | Core to "Company Brain" thesis — other agents must be able to query | — Pending |
| Telemetry harvests Claude Code JSONL + editor events + terminal + git | Four independent signal sources reduce reliance on any one; matches zero-tax mandate | — Pending |
| Local-only / no SaaS in v1 | Bounds scope; avoids auth/multi-tenancy complexity that would dwarf the kernel work | — Pending |

---
*Last updated: 2026-04-28 after initialization*
