---
type: requirements-brief
date: 2026-05-17
source: ../prds/e2e-test-reliability.md
workflow: /capture-requirements
status: final
origin: "/scope from #496 follow-up — systematic sweep of order-dependent flake + similar issues"
---

# Requirements Brief: E2E Test Reliability + Schema Strictness Sweep

## Problem Being Solved

qontoctl's E2E suite has a three-layer reliability defect that hid #496 for ~2 weeks. **L1 — Failure-Visibility Defect** (the disease): a two-stage silent mask (`if (result.isError === true) return;` → `if (createdId === undefined) return;`) conflates skip / fail / pass into a single green dot. **L2 — Schema-Runtime Drift Gap** (the absent immune system): Zod schemas encode strict assumptions (`z.string().nullable()`) that diverge from Qonto's actual `required` semantics; no detection mechanism exists. **L3 — Sandbox-State Contract** (the implicit dependency): write endpoints have undocumented preconditions; each contributor rediscovers them as "flake". The visible `quote_has_no_attachment` 412 is the symptom; L1 is the root cause that lets the other two hide.

Concrete scope discovered by direct enumeration: **30 L1 mask occurrences across 14+ E2E test files**, **~60 chained-undefined skips across 25+ files**, **81 nullable-not-optional fields across 15 core schema files** (post-#602; that PR fixed only 4).

## Key Requirements (top 7)

1. **R-FV-1 to R-FV-5 — L1 elimination**: Replace every `if (result.isError === true) return;` and `if ({sharedId} === undefined) return;` with `it.skip("recorded reason")` or explicit failure. Cover all 14+ identified files. Suite-wide grep returns 0 occurrences post-fix.

2. **R-SS-1 to R-SS-5 — L2 strictness audit**: Audit all 81 occurrences against Qonto's `required` list (or runtime probe where docs are silent). Relax `nullable()` → `nullable().optional()` where field is not in `required`. Each fix carries a regression test per the #602 convention.

3. **R-SP-1 to R-SP-3 — L3 sandbox preconditions**: Author `docs/qonto-sandbox-preconditions.md` covering every write endpoint with known 412/422 precondition path. Inline-link from affected tests. Fix `quote_update` 412 root cause (attach attachment OR skip-with-reason).

4. **R-CP-1 to R-CP-4 — Schema-vs-runtime contract probe**: Tool that calls Qonto endpoints (OAuth-authed) and diffs response shapes against Zod schemas; produces `SchemaDriftReport` with extra/missing fields and strictness mismatches. Suggests corrective declarations but does not auto-apply.

5. **R-OI-1, R-OI-2 — Test order independence verification**: Mechanism to detect cross-test state contamination (run shuffled, diff outcomes). Mechanism choice deferred to design (random-seed runner vs snapshot diff vs manual audit invariant).

6. **R-SR-1, R-SR-2 — Skip reason discipline**: Every `it.skip("...")` carries non-empty reason; taxonomy convention defined (`sandbox-precondition:`, `upstream-skipped:`, `feature-not-supported:`, `missing-fixture:`); enforced via lint at minimum for non-empty.

7. **R-FV-3, R-FV-4 — Failure visibility outcomes**: Skipped tests are visibly skipped in vitest report (never silently green). Unexpected error paths fail explicitly (never silently skip).

## Key Decisions

1. **Three-layer reframe**: The user's "order-dependent flake" frame was reframed (Phase 0) as a three-layer defect with L1 as root cause. The systematic-sweep ask becomes "audit every CRUD-lifecycle chain for the L1 pattern" rather than "look for similar flakes". This expands scope from "fix the visible 412" to "eliminate the disease class".

2. **Excellence-target appetite**: 2-3 weeks across three waves — Wave A (3-5d quick wins: L1+L2 audit), Wave B (5-7d sweep+docs: L3 preconditions + sweep coverage), Wave C (5-10d infrastructure: contract probe + order-independence verification). All three waves IN; user confirmed "aim for excellence" so contract probe (highest preventive leverage) is included.

3. **OAuth baseline OUT of scope**: 63 OAuth E2E failures observed during #496 execution were confirmed environmental (expired refresh token in user's local `.qontoctl.yaml`); user relogins to recover. Not a test reliability defect.

4. **Mocking remains forbidden**: Project memory (`feedback_mcp_void_formatter_trap`) records that mocks lied in the past. Contract probe and E2E both hit real Qonto; this PRD does not introduce mocks.

5. **Contract probe is suggest-don't-apply**: Probe outputs a `SchemaDriftReport` with suggested Zod corrections but does NOT auto-modify schema files. Auto-remediation is v2 territory.

6. **CI integration of contract probe deferred to design** (Q1): Three options under consideration — (a) nightly local cron, (b) new CI job with OAuth secret, (c) pre-release ad-hoc invocation. Tradeoffs analyzed in Stage 2 design.

7. **Conservative strictness posture for ambiguous fields** (R-SS-5): When Qonto docs are silent AND runtime probe is unavailable for a field, default to `nullable().optional()` with explicit ambiguity comment. Prefer false-positive widening over false-negative strictness (since strict-when-loose causes #496-style production failures).

## Assumptions & Risks

| ID     | Color   | Risk                                                                                                                                                                                                    |
| ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1     | Green   | Qonto's `required` list is authoritative for "may be omitted" semantics                                                                                                                                 |
| A2     | Green   | 30 L1 + 60 chained-undefined occurrences enumerate the complete pattern (grep is mechanical)                                                                                                            |
| A3     | Yellow  | Qonto sandbox stable enough for contract probe (no rate-limit blocking)                                                                                                                                 |
| A4     | Green   | Existing OAuth credentials sufficient for probe (no new OAuth scope)                                                                                                                                    |
| A5     | Yellow  | `quote_update` 412 root cause is `attachment_id` missing (design phase confirms)                                                                                                                        |
| A6     | Green   | Contract probe scope is bounded (suggest-don't-apply; no auto-remediation in v1)                                                                                                                        |
| A7     | Yellow  | All 81 nullable occurrences are drift candidates (#602 sample: 4/4 confirmed)                                                                                                                           |
| **A8** | **Red** | **Qonto OpenAPI / docs kept in sync with live API** — #496 itself proves divergence; contract probe exists precisely to detect this. This risk is the project's load-bearing motivation, not a blocker. |

## Stats

- **Objects**: 7 (E2ETest, PreconditionGate, ZodSchemaField, QontoEndpointContract, SchemaDriftReport, SandboxPreconditionDoc, CRUDLifecycleChain)
- **EARS Requirements**: 20 across 6 groups (failure-visibility, schema-strictness, sandbox-preconditions, contract-probe, order-independence, skip-reason discipline)
- **Acceptance Criteria scenarios**: 5 (each with explicit BUT NOT)
- **Quality Attributes (Planguage)**: 3 (test-reliability, schema-fidelity, failure-visibility)
- **Cross-cutting subsections**: 6 (Security, Compliance, Reliability, Performance, Operational, Lifecycle)
- **Feature Completeness verdict**: 3 COMPLETE / 3 NEAR-COMPLETE / 1 INCOMPLETE (gaps captured as DoR findings)
- **Assumptions**: 4 green / 3 yellow / 1 red

## DoR Verdict

`passed-with-findings` — three design-phase open questions:

- **Q1**: Contract probe CI integration model (nightly-local vs CI-job-with-OAuth-secret vs pre-release-ad-hoc)
- **Q2**: Sandbox precondition enforcement model (document-only vs probe-before-call)
- **Q3**: Test order independence verification mechanism (random-seed runner vs snapshot diff vs manual-audit invariant)

These do not block scoping; they parametrize design.

## Full PRD

See [`e2e-test-reliability.md`](../prds/e2e-test-reliability.md)
