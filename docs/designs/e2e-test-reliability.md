---
type: solution-design
date: 2026-05-17
source_prd: ../prds/e2e-test-reliability.md
brief: ../briefs/2026-05-17-design-e2e-test-reliability.md
status: final
tracks:
    - test-architecture
    - technical-architecture
    - tooling (contract probe, order-independence check, lint guards)
tracks_skipped:
    - ui-visual-design (no UI — test infra + scripts)
    - data-architecture (no persistence — probe writes ephemeral .tmp reports)
    - ux-prototype-validation (developer-facing; no user testing)
    - infrastructure (no new infra — local scripts + existing CI)
    - integration (Qonto already integrated; probe reuses existing http-client)
    - security (no auth/data-surface change — PRD §8.1 N/A with rationale)
    - performance (E2E sequential by design — PRD §8.4 out of scope)
resolved_open_questions:
    Q1: "Contract probe — LOCAL-ONLY (CI is api-key by design; OAuth cannot live in CI cleanly; quarterly + pre-release local run suffices for solo maintainer)"
    Q2: "Sandbox preconditions — DOCUMENT-ONLY in v1 (probe-before-call doubles sandbox traffic; deferred to v2 if doc-only proves insufficient)"
    Q3: "Order independence — HYBRID (manual audit during T1 sweep + module-scope-mutable-state lint + pre-release run-twice-and-diff script; random-seed vitest plugin is v2)"
---

# Solution Design: E2E Test Reliability + Schema Strictness Sweep

## 1. Goals & Drivers

- **Eliminate the L1 disease**: zero `if (result.isError === true) return;` and zero silent chained-undefined skips suite-wide; every non-execution is a _visible_ skip with a recorded reason
- **Close the L2 drift**: every `nullable()`-not-`optional()` core schema field reconciled against Qonto's contract, each fix carrying a regression test
- **Document the L3 contract**: every write endpoint with a known precondition documented + linked from its test
- **Build the immune system**: a contract probe that detects schema drift before users do
- **Make order-dependence detectable**: a mechanism that surfaces cross-test state contamination
- **Prevent regression**: guards (lint / CI grep) that stop the L1 pattern from reappearing

## 2. Constraints

- TypeScript ESM monorepo (turborepo + pnpm); strict tsconfig (composite, exactOptionalPropertyTypes, noUncheckedIndexedAccess, verbatimModuleSyntax)
- `SPDX-License-Identifier: AGPL-3.0-only` + `(C) 2026 Oleksii PELYKH` on every new file
- Coverage manifest entries required for new `cli:` / `core:` / `mcp:` surfaces (#462 policy) — N/A here (no new product surfaces; only test + script + doc)
- No mocking in E2E (project memory `feedback_mcp_void_formatter_trap`)
- E2E sequential (`--concurrency=1`), per-test 30 s timeout
- No new runtime deps in `core`/`cli`/`mcp`; probe script may use existing `core` http-client + dev tooling (`tsx`)
- Commit format `(type) lowercase message`; rebase-only merge (memory `project_merge_method_rebase_only`)
- `pnpm format:check` + full `pnpm test:e2e` before PR (memories `feedback_pnpm_format_check_first`, `feedback_e2e_before_pr`)

## 3. Context & Scope

External systems:

- **Qonto API** (sandbox via staging-token; production direct) — E2E + contract probe consume read+write endpoints
- **vitest** — test runner; skip mechanism is `ctx.skip(reason)` (runtime) / `it.skip` (static)

Boundaries:

- IN: L1 elimination, L2 audit, L3 documentation, contract probe, order-independence detection, regression guards
- OUT: OAuth lifecycle, retry/quarantine infra, mocking, parallel E2E, OAuth-in-CI, new endpoint coverage, framework migration (all per PRD §1.4)

## 4. Solution Strategy

Five shape decisions, in order of consequence:

1. **L1 sweep IS the L3 triage.** Every `if (result.isError === true) return;` site is, by construction, a place where the suite expects a precondition might fail. Walking all 14+ files for L1 _is_ the enumeration of L3 preconditions. T1 and T2 are one pass, not two — categorize each site as `feature-not-supported` / `precondition-not-met` / `unexpected-error` and the doc + skip-reason fall out of the same judgment.

2. **Runtime skip, not silent return.** vitest supports `ctx.skip(reason)` inside a test body. The L1 fix is mechanical: `if (result.isError === true) return;` → `if (result.isError === true) { ctx.skip(\`sandbox: ${firstTextFromMcpResult(result)}\`); return; }`. Chained-undefined becomes skip-reason propagation through a module-scope `lifecycleSkip` carrier.

3. **Helpers make the migration uniform and the regression preventable.** Two helpers in `packages/e2e/src/helpers.ts` (`skipIfToolError`, `skipIfUpstreamSkipped`) collapse ~90 hand-written sites into one reviewed implementation. A CI grep guard (`scripts/check-no-silent-skip.js`, modeled on the existing `scripts/check-coverage-drift.js`) bans the raw pattern's return.

4. **L2 audit is worklist-driven, evidence-cited, conservatively-defaulted.** A generator script emits the 81-item worklist; each item is resolved against Qonto OpenAPI with a citation comment; ambiguous items default to `nullable().optional()` (R-SS-5 — false-positive widening is safe; false-negative strictness causes #496). Each fix carries a "field omitted entirely" regression test.

5. **The contract probe is the L2 audit's force multiplier AND its successor.** Where Qonto docs are silent, the probe resolves L2 ambiguity by observing the live response. Post-v1, the probe replaces manual audit as the ongoing drift detector. Build the probe early enough in Wave C that Wave A's ambiguous L2 items can consume its output.

## 5. Building Blocks

```
packages/e2e/src/
├── helpers.ts                         # + skipIfToolError(result, ctx, kind)
│                                      # + skipIfUpstreamSkipped(carrier, ctx)
│                                      # + LifecycleSkipCarrier type
└── {domain}/{cli,mcp}.e2e.test.ts     # 14+ files: L1 sites migrated to helpers

scripts/
├── check-no-silent-skip.js            # CI guard: bans `isError === true) return` regression
├── list-nullable-audit-candidates.js  # emits .tmp/l2-audit-worklist.json (81 items)
├── contract-probe.ts                  # tsx: OAuth → sample endpoints → safeParse → drift report
├── contract-probe.endpoints.json      # endpoint → schema mapping for the probe sample
└── check-order-independence.sh        # pre-release: run suite default + shuffled, diff outcomes

docs/
└── qonto-sandbox-preconditions.md     # NEW: per-write-endpoint precondition catalog

packages/core/src/**/*.schema.ts       # L2 fixes (relax nullable→nullable().optional())
packages/core/src/**/*.schema.test.ts  # L2 regression tests (per fixed field)
```

No changes to `cli`/`mcp`/`qontoctl` product packages — this is test + tooling + docs only.

## 6. Track: Test Architecture (T1 — L1 + L2, Wave A)

### 6.1 L1 elimination (R-FV-1 … R-FV-5)

**Helper contract** (`packages/e2e/src/helpers.ts`):

```ts
type SkipKind = "feature-not-supported" | "sandbox-precondition" | "missing-fixture";

// Returns true if the test should stop (caller does `return`).
// Calls ctx.skip(reason) so the skip is VISIBLE in the vitest report.
function skipIfToolError(
    result: { isError?: boolean },
    ctx: { skip: (reason: string) => void },
    kind: SkipKind,
    detail: string,
): boolean;

// Module-scope carrier threaded through a CRUD chain.
interface LifecycleSkipCarrier {
    reason: string | undefined;
}

function skipIfUpstreamSkipped(carrier: LifecycleSkipCarrier, ctx: { skip: (reason: string) => void }): boolean; // true if upstream skipped; ctx.skip("upstream-skipped: {reason}")
```

**Migration pattern** (per the smoking-gun `quotes/mcp.e2e.test.ts`):

```ts
// BEFORE (L1 mask):
const listResult = await client.callTool({ name: "quote_list", arguments: {} });
if (listResult.isError === true) return;
// ...
it("updates the created quote", async () => {
  if (createdQuoteId === undefined) return;   // silent chain
  ...
});

// AFTER:
const lifecycleSkip: LifecycleSkipCarrier = { reason: undefined };
it("creates a quote", async (ctx) => {
  const listResult = await client.callTool({ name: "quote_list", arguments: {} });
  if (skipIfToolError(listResult, ctx, "feature-not-supported", "quote_list")) {
    lifecycleSkip.reason = "quote_list unavailable in sandbox";
    return;
  }
  const createResult = await client.callTool({ name: "quote_create", arguments: {...} });
  // create errors are NO LONGER masked — explicit assertion:
  expect(createResult.isError, `quote_create failed: ${firstTextFromMcpResult(createResult)}`)
    .toBeFalsy();
  createdQuoteId = (...).id;
});
it("updates the created quote", async (ctx) => {
  if (skipIfUpstreamSkipped(lifecycleSkip, ctx)) return;   // VISIBLE skip w/ reason
  ...
});
```

**Per-site triage** (the judgment that makes T1 also do T2):

| Category                | Example                                                      | Action                                                                                         |
| ----------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `feature-not-supported` | `quote_list` errors because sandbox org has no quotes module | `skipIfToolError(..., "feature-not-supported", ...)` — no doc needed                           |
| `sandbox-precondition`  | `quote_update` 412 `quote_has_no_attachment`                 | doc entry in `qonto-sandbox-preconditions.md` + (fix test to satisfy OR skip-with-reason+link) |
| `unexpected-error`      | `quote_create` 422 schema-parse (the #496 bug)               | **explicit `expect(...).toBeFalsy()`** — NEVER skip; this is the class that must surface       |

**Regression guard** (`scripts/check-no-silent-skip.js`, wired into CI like `coverage-drift-check`):

- Fails if `grep -E "isError === true\)\s*return;"` matches anywhere in `packages/e2e/src/`
- Fails if `it.skip("")` or `ctx.skip("")` (empty reason) matches (R-SR-1)
- Output mirrors `check-coverage-drift.js` finding format (`[SILENT_SKIP] {file}:{line}`)

### 6.2 L2 strictness audit (R-SS-1 … R-SS-5)

**Worklist generator** (`scripts/list-nullable-audit-candidates.js`):

- Greps `packages/core/src/**/*.ts` (excl. tests) for `z.<type>().nullable()` not followed by `.optional()`
- Emits `.tmp/l2-audit-worklist.json`: `[{ file, line, field, schema, qonto_doc_hint }]` — 81 items
- `qonto_doc_hint` left blank; filled per-item during audit

**Per-field decision tree**:

```
For each worklist item:
  1. Look up the field in Qonto OpenAPI (developer portal) for the owning endpoint
  2. Field listed in endpoint's `required` array?
       YES → keep nullable() (Qonto guarantees presence); annotate worklist `verdict: keep`
       NO  → relax to nullable().optional(); annotate `verdict: relax`; add regression test
  3. Docs silent / endpoint not in OpenAPI?
       → consume contract-probe output (T3) for that endpoint if available
       → else apply R-SS-5 conservative posture: nullable().optional() + comment:
         `// Qonto docs silent on {field}.required; conservative optional per R-SS-5 (#496-class safety)`
```

**Regression test convention** (mirrors #602, appended to existing `*.schema.test.ts`):

```ts
it("accepts {SchemaName} with {field} omitted entirely (regression: L2 audit)", () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { {field}, ...without } = valid{Schema}Fixture;
  expect(() => {Schema}.parse(without)).not.toThrow();
});
```

## 7. Track: Tooling (T2 — Sandbox Preconditions, Wave B)

### 7.1 `docs/qonto-sandbox-preconditions.md` (R-SP-1, R-SP-2)

Structure — one section per write endpoint surfaced by T1's `sandbox-precondition` triage:

```markdown
### `PATCH /v2/quotes/:id` {#patch-v2-quotes-id}

**Precondition**: Quote must have an attachment before PATCH.
**Failure signature**: HTTP 412, error key `quote_has_no_attachment`.
**Remediation in tests**: Upload+attach via `POST /v2/quotes/{id}/attachments`
before `quote_update`; OR `ctx.skip("sandbox-precondition: see #patch-v2-quotes-id")`.
**Discovered**: #496 / #602 (2026-05-17).
```

Tests link inline: `// precondition: docs/qonto-sandbox-preconditions.md#patch-v2-quotes-id`.

### 7.2 `quote_update` 412 resolution (R-SP-3)

- **Path A (attempt first)**: design-phase probe — does Qonto sandbox expose a quote-attachment create endpoint usable from the E2E harness? If yes, CRUD lifecycle gains a step: create quote → upload attachment → attach → update. The 412 disappears for real.
- **Path B (fallback)**: if attachment-create is itself precondition-laden or absent in sandbox, `ctx.skip("sandbox-precondition: quote_update requires attachment; see docs/qonto-sandbox-preconditions.md#patch-v2-quotes-id")`.
- Decision rule: spend ≤ 0.5 day on Path A; if it rabbit-holes, take Path B. Either satisfies R-SP-3.

### 7.3 Q2 resolution — DOCUMENT-ONLY (v1)

Probe-before-call (test calls `GET .../attachments` before `PATCH`, skips if absent) **doubles sandbox write-path traffic** and adds a network round-trip per lifecycle test. Document-only (R-SP-1/2) delivers the primary value — contributors stop rediscovering preconditions — at zero runtime cost. Probe-before-call is reconsidered in v2 only if document-only proves insufficient (signal: a precondition regression slips through despite the doc).

## 8. Track: Tooling (T3 — Contract Probe + Order Independence, Wave C)

### 8.1 Contract probe (R-CP-1 … R-CP-4)

**`scripts/contract-probe.ts`** (invoked `pnpm contract-probe`, runs via `tsx`):

```
1. Load OAuth creds from resolved config (reuse core config-resolver)
2. Read scripts/contract-probe.endpoints.json: [{ id, method, path, schema }]
3. For each endpoint (read-only sample):
     a. Call via core http-client (real Qonto; OAuth; staging-token if configured)
     b. schema.safeParse(response)
     c. parse OK → walk response keys vs schema keys → extra_fields / missing_fields
     d. parse FAIL → map ZodError.issues → strictness_mismatches
     e. emit suggested corrective declaration per mismatch
4. Write .tmp/contract-probe/{ISO8601}.json (SchemaDriftReport[])
5. Console summary table; exit 1 if any endpoint has mismatches (scriptable)
```

- Read-only by construction (endpoints.json contains only GET endpoints — no write surface)
- Backoff on 429 (reuse core http-client retry); partial report on rate-limit (A3 mitigation)
- Expired-OAuth detection → clear error, exit 2 (not silent failure)
- **Suggest-don't-apply**: never edits `*.schema.ts` (PRD out-of-scope; v2 territory)

### 8.2 Q1 resolution — LOCAL-ONLY (v1)

CI is api-key-only **by design** (CLAUDE.md § E2E in CI). OAuth state is user-specific and cannot live in CI without secret-rotation overhead disproportionate to a solo-maintainer project. Decision: `pnpm contract-probe` is a **local + pre-release** tool, added to `docs/release-runbook.md` as a pre-release step and run quarterly. Re-evaluate a CI job only if drift frequency proves high (signal: >1 user-reported schema bug per quarter despite quarterly probe).

### 8.3 Order independence (R-OI-1, R-OI-2) + Q3 resolution — HYBRID

Three layers, lowest-cost first:

1. **Manual audit during T1 sweep** (Wave B, ~0): while migrating L1 sites, every module-scope mutable `let createdId` is already under the eye. Document the invariant in `docs/e2e-testing.md`: "No test may depend on another test's side effects except within an explicit CRUD-lifecycle `describe` block using the `LifecycleSkipCarrier` pattern."
2. **Lint guard** (Wave C): ESLint rule flagging module-scope `let` mutated across `it()` blocks _outside_ a recognized lifecycle `describe`. Catches new contamination at authoring time.
3. **Pre-release diff** (`scripts/check-order-independence.sh`, Wave C): run suite twice — default order, then `--sequence.shuffle --sequence.seed=$RANDOM` — capture vitest JSON reporter outcomes, diff the pass/fail/skip _sets_ (skip-reason text may legitimately differ; pass/fail membership may not). Divergence → list contaminated tests (R-OI-2).

Random-seed-matrix vitest plugin (run N seeds in CI) deferred to v2 — layers 1-3 cover the solo-maintainer risk surface.

## 9. Feasibility & Risk Assessment

| Component               | Feasibility                                | Key risk                                                                  | Mitigation                                                                                     |
| ----------------------- | ------------------------------------------ | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| L1 elimination (T1)     | HIGH — mechanical, 14 files, helper-driven | Mis-triage: legit skip→fail (flaky suite) or hidden-bug→skip (regression) | Explicit 3-category triage table (§6.1); `unexpected-error` defaults to assertion not skip     |
| L2 audit (T1)           | HIGH — bounded 81 items, #602 precedent    | False relaxation of a Qonto-required field                                | Regression test per fix; cite Qonto OpenAPI or probe; conservative default is _safe_ direction |
| Sandbox doc (T2)        | HIGH                                       | Doc staleness                                                             | "doc+test same PR" convention; doc cites discovering issue                                     |
| `quote_update` fix (T2) | MEDIUM — depends on sandbox attachment API | A5: 412 root cause might not be only attachment_id                        | Path A time-boxed 0.5d → Path B fallback always satisfies R-SP-3                               |
| Contract probe (T3)     | MEDIUM — new infra, bounded scope          | A3 Qonto rate-limit; A8 docs/runtime divergence                           | Backoff + partial report; A8 is the _motivation_ not a blocker                                 |
| Order independence (T3) | MEDIUM — least-defined                     | Mechanism over-engineering                                                | Hybrid 3-layer, lowest-cost-first; v2 escape hatch                                             |

**No INFEASIBLE must-have components.** No HIGH risks (all MEDIUM/LOW). A8 (RED assumption — Qonto docs drift from runtime) is the project's _raison d'être_, explicitly not a blocker.

## 10. Requirement → Track Coverage Matrix

| Requirement group      | Requirements | Track | Wave | Building block                                                          |
| ---------------------- | ------------ | ----- | ---- | ----------------------------------------------------------------------- |
| Failure visibility     | R-FV-1…5     | T1    | A    | `helpers.ts` + per-file migration + `check-no-silent-skip.js`           |
| Schema strictness      | R-SS-1…5     | T1    | A    | `list-nullable-audit-candidates.js` + per-field fix + regression tests  |
| Sandbox preconditions  | R-SP-1…3     | T2    | B    | `docs/qonto-sandbox-preconditions.md` + test links + quote_update fix   |
| Contract probe         | R-CP-1…4     | T3    | C    | `scripts/contract-probe.ts` + `endpoints.json`                          |
| Order independence     | R-OI-1…2     | T3    | C    | manual audit + lint guard + `check-order-independence.sh`               |
| Skip reason discipline | R-SR-1…2     | T1+T3 | A/C  | `skipIfToolError` enforces non-empty; `SkipKind` is the R-SR-2 taxonomy |

**Coverage: 20/20 requirements mapped. Zero orphans. Zero decomposition-introduced gaps.**

## 11. Skipped Tracks (with rationale)

| Track                   | Why skipped                                                                        |
| ----------------------- | ---------------------------------------------------------------------------------- |
| ui-visual-design        | No UI surface — test code, scripts, markdown                                       |
| data-architecture       | No persistence — probe writes ephemeral `.tmp/contract-probe/` reports             |
| ux-prototype-validation | Developer-facing internal tooling; no user testing applicable                      |
| infrastructure          | No new infra — local `pnpm` scripts + existing CI grep-guard pattern               |
| integration             | Qonto already integrated; probe reuses existing `core` http-client                 |
| security                | No auth/data-surface change (PRD §8.1 N/A); probe reuses existing creds, read-only |
| performance             | E2E sequential by design (PRD §8.4 OUT); probe is on-demand, not hot-path          |

## 12. Change Log

| Date       | Change                                                                    | Source                            |
| ---------- | ------------------------------------------------------------------------- | --------------------------------- |
| 2026-05-17 | Initial design authored via `/design-solution` Stage 2; Q1/Q2/Q3 resolved | `/scope` execution (this session) |
