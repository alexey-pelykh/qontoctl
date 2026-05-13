---
type: scope-brief
date: 2026-05-12
workflow: /scope
status: final
pivot_from: org-capabilities-probe (over-scoped; dropped after problem-framing pushback)
---

# Scope Brief: qontoctl diagnose

## Problem

qontoctl users hitting `401/403/422` have no fast way to learn **why** — `auth status` covers OAuth alone; nothing surfaces org-level config (scopes, feature flags, plan limits, sandbox routing) in one place. `diagnose` becomes "the first command to run when something doesn't work."

## What's In Scope

1. **#578** — `(feat) qontoctl diagnose — user-facing healthcheck CLI command + MCP tool`

Single tracked work item, 1–2 day appetite, single PR. Covers:

- CLI command with table/JSON output and exit codes 0/1/2/10
- Core service layer (`packages/core/src/diagnose/`): declarative check registry + sequential runner + whitelist redaction + 9 atomic checks
- MCP tool (read-only, same JSON shape as CLI; input `{ profile? }` only)
- Documentation: new `docs/troubleshooting.md`
- Tests: unit (high coverage) + 2 E2E + CI redaction audit + coverage manifest entries

## Key Decisions

1. **Pivoted from `org-capabilities-probe`** — that scope conflated internal QA (verdict drift) with user-facing diagnostic. The pivoted scope focuses solely on real user value; verdict drift is a separate agent-discipline concern.
2. **Single tracked work item, not decomposed** — 1–2 day cohesive PR doesn't benefit from artificial sub-issue fan-out. /decompose evaluation: appropriately sized (score 7–8).
3. **Stage 3.5 (Specification Formulation) skipped** — repo uses vitest, not Cucumber. PRD §5a GWT scenarios are Tier B and ready to transcribe directly to `describe/it`; alien Gherkin files would not fit codebase conventions.
4. **Stage 4 single-item Ready** — all readiness criteria met:
    - Test strategy resolved in design §11.5 (unit + E2E + CI redaction audit)
    - 4 Tier-B AC scenarios with BUT NOT clauses
    - Dependencies identified (reuses `getOrganization`, `getEInvoicingSettings`)
    - DoR findings (A2 OAuth introspection, redaction whitelist) resolved by Stage 2 ADRs
5. **Three internal architecture commitments baked in**:
    - **ADR-DIAG-1** — reuse existing core services, don't reimplement
    - **ADR-DIAG-2** — whitelist redaction + global tripwire regex (defense in depth)
    - **ADR-DIAG-5** — CLI and MCP share core; MCP input has no display flags

## Stats

- **Work items**: 1 (#578)
- **Ready**: 1 / 1
- **Gaps accepted**: 0
- **Deferred**: 0
- **PRD requirements covered**: 14 / 14 (per design §16 Coverage Matrix; PASS)
- **Risk register**: 0 HIGH / 3 MED (all mitigated) / 2 LOW
- **Feasibility**: All components FEASIBLE — no spikes needed

## Artifacts

- **PRD**: [docs/prds/qontoctl-diagnose.md](../prds/qontoctl-diagnose.md)
- **Requirements brief**: [2026-05-12-requirements-qontoctl-diagnose.md](2026-05-12-requirements-qontoctl-diagnose.md)
- **Design doc**: [docs/designs/qontoctl-diagnose.md](../designs/qontoctl-diagnose.md)
- **Design brief**: [2026-05-12-design-qontoctl-diagnose.md](2026-05-12-design-qontoctl-diagnose.md)
- **Tracked work item**: [#578](https://github.com/alexey-pelykh/qontoctl/issues/578)

## Next Steps

- `/do 578` — start implementation
- `/investigate 578` — deep forensics before execution (optional)
- `/do-next` — pick highest-priority ready item (will surface #578 alongside any other ready items)
