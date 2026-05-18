---
type: scope-brief
date: 2026-05-17
workflow: /scope
status: final
origin: "Session-discovered during /do #496 — order-dependent flake + user-stated systematic-sweep instruction"
---

# Scope Brief: E2E Test Reliability + Schema Strictness Sweep

## Problem

qontoctl's E2E suite hid issue #496 for ~2 weeks (reopened twice before #602 fixed it). Root-cause analysis surfaced a **three-layer defect**, not a single flake:

- **L1 — Failure-Visibility Defect (the disease)**: a two-stage silent mask (`if (result.isError === true) return;` → `if (createdId === undefined) return;`) conflates skip/fail/pass into one green dot. **30 occurrences / 14+ files; ~60 chained-undefined / 25+ files.**
- **L2 — Schema-Runtime Drift (absent immune system)**: Zod `nullable()` is stricter than Qonto's OpenAPI `required` semantics. **81 occurrences / 15 core files** (#602 fixed 4; #601 owns the Quote+ClientInvoice slice).
- **L3 — Sandbox-State Contract (implicit dependency)**: write-endpoint preconditions are undocumented; rediscovered as "flake" each time.

The visible `quote_has_no_attachment` 412 is a **symptom**; L1 is the disease that let L2 hide and made L3 look like noise. Reframed in Phase 0 from "order-dependent flake" to this three-layer model — user confirmed ("proceed, we aim for excellence" → Wave C contract probe IN).

## What's In Scope

Standalone epic **#603** + 6 ready children (2–3 week appetite, 3 waves):

| WI       | Wave | Title                                                                                         |
| -------- | ---- | --------------------------------------------------------------------------------------------- |
| **#604** | A    | `(test)` eliminate L1 silent-skip mask suite-wide + skip-reason helpers + CI regression guard |
| **#605** | A    | `(audit)` nullable-vs-optional sweep — core schema files beyond #601 (~70 fields / 13 files)  |
| **#606** | B    | `(docs)` Qonto sandbox-preconditions catalog + inline test links                              |
| **#607** | B    | `(fix)` quote_update E2E 412 quote_has_no_attachment under suite load                         |
| **#608** | C    | `(test)` schema-vs-runtime contract probe — local drift detector                              |
| **#609** | C    | `(test)` E2E order-independence detection (invariant + lint + pre-release diff)               |

Existing-tracker reconciliation (no duplication): **#601** kept as-is (Quote+ClientInvoice L2 slice; #605 is its sibling for the rest); **#449** cross-linked as orthogonal (coverage _expansion_ vs reliability of _existing_); **#539/#561/#570/#567** absorbed as L3 catalog entries; **#591** noted out-of-scope (mocking + OAuth-in-CI both PRD-excluded).

## What's Out of Scope

OAuth credential lifecycle (user-confirmed environmental — relogin handles it); retry/quarantine infra (convergence philosophy: fix roots, don't mask); mocking (project memory: mocks lied before); parallel E2E; OAuth-in-CI; new endpoint coverage (→ #449); framework migration.

## Key Decisions

1. **Three-layer reframe (Phase 0)** — "systematic sweep" became "audit every CRUD chain for the L1 disease," not "look for similar flakes." Expanded scope from fixing the visible 412 to retiring the pattern class.
2. **Sibling #601, not rewrite (user-confirmed)** — preserves #601's curated OpenAPI evidence cache; #605 covers the non-Quote/CI remainder.
3. **Standalone epic, not nested under #449 (user-confirmed)** — reliability-of-existing ≠ coverage-expansion; different success criteria; cross-linked not nested.
4. **3 design open questions resolved (Stage 2)** — Q1→LOCAL-ONLY (CI is api-key by design), Q2→DOCUMENT-ONLY (probe-before-call doubles traffic; v2), Q3→HYBRID (manual audit + lint + pre-release diff).
5. **No `.feature` files (Stage 3.5)** — vitest project, not Cucumber; PRD §5 GWT+BUT NOT is the Tier-B spec; tests/guards/scripts ARE the Tier-A bindings. Gap closed: PRD Scenario 6 added for #609 (the only WI lacking an executable scenario).
6. **Coverage gate PASS-WITH-FINDINGS, remediated in-place (Stage 3.7)** — 3 minor findings (2 seam data-flow pins on #606/#609, 1 stale PRD §8.5/§8.6 text) fixed directly rather than filing tracking-ceremony for one-line consistency.
7. **L1 sweep IS the L3 triage (design shape)** — one pass categorizes every `isError` site as `feature-not-supported` / `sandbox-precondition` / `unexpected-error`; the catalog + skip-reasons fall out of the same judgment. The `unexpected-error` class (the #496 bug class) defaults to an explicit assertion, NEVER a skip — the single most important reversal.

## Stats

- **Work items**: 6 ready children + 1 tracking epic (#603); #601 sibling-linked (kept)
- **Ready**: 6 / 6 (binary gate + test-strategy Phase 0 viability — all pass)
- **PRD requirements**: 20 EARS / 6 GWT scenarios / 3 Planguage attributes — 20/20 mapped, zero orphans
- **DoR**: `passed-with-findings` → all 3 findings resolved in design + Stage 3.5
- **Pipeline**: Stages 0→1→2→3→3.5→3.7→4 all complete (2.5 skipped — single context)

## Artifacts

- PRD: [`docs/prds/e2e-test-reliability.md`](../prds/e2e-test-reliability.md)
- Design: [`docs/designs/e2e-test-reliability.md`](../designs/e2e-test-reliability.md)
- Requirements brief: [`2026-05-17-requirements-e2e-test-reliability.md`](2026-05-17-requirements-e2e-test-reliability.md)
- Design brief: [`2026-05-17-design-e2e-test-reliability.md`](2026-05-17-design-e2e-test-reliability.md)

## Next Steps

`/do 604` to start (Wave A; unblocks #606 + #607). Recommended order: #604 → #605 (∥) → #606, #607 → #608, #609.
