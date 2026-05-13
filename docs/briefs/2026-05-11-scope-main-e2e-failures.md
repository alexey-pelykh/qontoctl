---
type: scope-brief
date: 2026-05-11
workflow: /scope
status: final
---

# Scope Brief: Pre-existing E2E failures on `main`

## Problem

When baselining PR #535 (issue #455 — E2E for client-invoice file upload + retrieval), the full `pnpm test:e2e` suite surfaced 4 failures unrelated to the PR. All 4 reproduce on `main` (verified by checking out main and re-running). They are blocking a clean E2E baseline for any future PR that wants to run the full suite as a gate.

## What's In Scope

| #   | Issue                                                        | Title                                                                          | Severity                    |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------ | --------------------------- |
| 1   | [#536](https://github.com/alexey-pelykh/qontoctl/issues/536) | (fix) profile test E2E fails with exit code 1 for valid api-key credentials    | likely regression from #523 |
| 2   | [#537](https://github.com/alexey-pelykh/qontoctl/issues/537) | (fix) client_show MCP E2E asserts `name` property that individual clients omit | test assertion bug          |
| 3   | [#538](https://github.com/alexey-pelykh/qontoctl/issues/538) | (fix) card list E2E CSV + YAML format tests fail on empty card collections     | test setup bug              |

## Key Decisions

1. **3 issues, not 4** — Failures 3 and 4 (cards CSV + cards YAML) were grouped into a single issue (#538) because they share root cause (empty sandbox + formatter emitting empty output) AND fix shape (skip-when-empty, matching sibling tests). If the implementer discovers the root causes diverge during investigation, the issue can be split.

2. **Skipped Stages 1, 2, 2.5, 3.5** — These are bug reports with concrete failing tests. The failing test IS the executable specification (Tier B AC, promotable to Tier A by binding the fix). No requirements gathering, no architecture decisions, no Example Mapping needed.

3. **All marked READY without typed exceptions** — Each issue has a concrete reproducer (file:line + actual vs. expected output), an empirical root-cause hypothesis (with one confirmed via live probe — #537), and a bounded fix shape. Investigation work is part of the fix (especially for #536 where the failure-mode stderr was not captured).

4. **Labels** — `bug` + `testing` per existing label set. Not labeled `audit` because they were surfaced by PR-baseline check rather than the formal #449 audit; not labeled `release-blocker` because they don't gate the CLI's user-facing functionality (they gate `pnpm test:e2e` CI baseline only — currently the E2E suite is not on the CI gate).

## Stats

- **Work Items**: 3 in GitHub Issues (#536, #537, #538)
- **Ready**: 3 / 3
- **Gaps accepted**: 0 / 3
- **Deferred**: 0 / 3

## Next Steps

- `/do #536` — fix profile test (start here: investigation step is bounded, root may inform the others)
- `/do #537` — fix client_show MCP assertion (lowest-risk: pure test fix)
- `/do #538` — fix card list CSV+YAML tests (also test-side)
- Or `/do-all` to batch through them respecting any dependencies (none currently declared)
