---
type: design-brief
date: 2026-05-17
source: ../designs/e2e-test-reliability.md
workflow: /design-solution
status: final
---

# Design Brief: E2E Test Reliability + Schema Strictness Sweep

## Problem

qontoctl's E2E suite hid #496 for ~2 weeks via a two-stage silent mask (L1), atop undetected schema-runtime drift (L2) and undocumented sandbox preconditions (L3). The design eliminates the L1 disease suite-wide, audits all 81 L2 drift candidates, documents L3 preconditions, and builds a contract probe + order-independence detector as the preventive immune system.

## Key Decisions

1. **L1 sweep IS the L3 triage (single pass)** — every `if (result.isError === true) return;` site is, by construction, a precondition expectation. Walking all 14+ files for L1 _is_ the L3 enumeration. Each site categorized `feature-not-supported` / `sandbox-precondition` / `unexpected-error`; doc + skip-reason fall out of the same judgment. T1 and T2 are not separate passes.
2. **Runtime skip via `ctx.skip(reason)`, never silent return** — vitest supports in-body runtime skip. The `unexpected-error` category (the #496 class) defaults to `expect(...).toBeFalsy()` — an explicit assertion, NEVER a skip. This is the single most important reversal: the bug class that must surface, surfaces.
3. **Two helpers collapse ~90 sites into one reviewed implementation** — `skipIfToolError` + `skipIfUpstreamSkipped` in `helpers.ts`; `SkipKind` union IS the R-SR-2 taxonomy. Chained-undefined becomes skip-reason propagation through a module-scope `LifecycleSkipCarrier`.
4. **CI grep-guard prevents L1 regression** — `scripts/check-no-silent-skip.js` (modeled on existing `check-coverage-drift.js`) fails CI if the raw pattern or empty-reason skip reappears.
5. **L2 audit is worklist-driven, evidence-cited, conservatively-defaulted** — generator emits the 81-item worklist; each resolved against Qonto OpenAPI with a citation comment; ambiguous → `nullable().optional()` (R-SS-5, since false-positive widening is safe but false-negative strictness causes #496). Regression test per fix.
6. **Contract probe is the L2 audit's force multiplier AND successor** — where Qonto docs are silent, the probe resolves L2 ambiguity by observing live responses; post-v1 it replaces manual audit as the ongoing drift detector. Build early in Wave C so Wave A's ambiguous items consume its output.
7. **Suggest-don't-apply probe** — `scripts/contract-probe.ts` emits `SchemaDriftReport` with corrective Zod suggestions but never edits schema files (auto-remediation is v2).

## Design Tracks

| Track                  | Approach                                                                             | Key trade-off                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Test Architecture (T1) | Helper-driven L1 migration + worklist-driven L2 audit, both with regression coverage | ~90 hand sites → 2 helpers; per-site triage judgment is irreducible           |
| Tooling (T2)           | `docs/qonto-sandbox-preconditions.md` + inline test links + quote_update fix         | Document-only (not probe-before-call) — zero runtime cost, defers enforcement |
| Tooling (T3)           | `contract-probe.ts` (local) + hybrid order-independence (audit+lint+diff)            | Local-only probe + 3-layer order check; CI/random-seed deferred to v2         |

Skipped (rationale in design §11): ui-visual-design, data-architecture, ux-prototype-validation, infrastructure, integration, security (PRD §8.1 N/A), performance (PRD §8.4 OUT).

## Open Questions — All Resolved

The PRD's 3 DoR findings are resolved in design frontmatter:

- **Q1 → LOCAL-ONLY**: CI is api-key by design; OAuth can't live in CI cleanly. `pnpm contract-probe` is local + pre-release (added to release-runbook), run quarterly. CI job reconsidered only if drift frequency proves high.
- **Q2 → DOCUMENT-ONLY (v1)**: probe-before-call doubles sandbox write-path traffic for marginal gain. Documentation delivers the primary value (stop rediscovering preconditions) at zero runtime cost.
- **Q3 → HYBRID**: 3-layer lowest-cost-first — manual audit during T1 sweep + module-scope-mutable-state lint + pre-release run-twice-and-diff (`check-order-independence.sh`). Random-seed-matrix vitest plugin deferred to v2.

## Feasibility Verdict

No INFEASIBLE must-have components. No HIGH risks (all MEDIUM/LOW with mitigations). The one RED assumption (A8 — Qonto docs drift from runtime) is the project's motivation, not a blocker. `quote_update` fix has a time-boxed Path A with a guaranteed Path B fallback.

## Coverage

20/20 PRD requirements mapped to tracks/waves/building-blocks (design §10). Zero orphans, zero decomposition-introduced gaps.

## Full Design

See [`e2e-test-reliability.md`](../designs/e2e-test-reliability.md)
