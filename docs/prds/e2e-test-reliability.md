---
type: prd
scope: e2e-test-reliability
created: 2026-05-17
formulation: {}
features: {}
artifacts:
    scope_doc: ../../.tmp/scopes/e2e-test-reliability-schema-strictness.md
    requirements_brief: ../briefs/2026-05-17-requirements-e2e-test-reliability.md
    design_doc: ../designs/e2e-test-reliability.md
    design_brief: ../briefs/2026-05-17-design-e2e-test-reliability.md
dor_status: passed-with-findings
dor_findings:
    - "Q1 (Contract-probe CI integration): OAuth-required; CI runs api-key only — design must decide nightly-locally vs new CI job with secret"
    - "Q2 (Sandbox precondition enforcement): document-only vs probe-before-call — defer to design"
    - "Q3 (Test order independence verification): mechanism (random-seed runner, snapshot diff, or manual audit) deferred to design"
related_commands: []
related_issues:
    - "#603 (epic — this PRD's tracking umbrella)"
    - "#604 (Wave A — L1 silent-skip elimination)"
    - "#605 (Wave A — L2 sweep beyond #601)"
    - "#606 (Wave B — sandbox-precondition catalog)"
    - "#607 (Wave B — quote_update 412 fix)"
    - "#608 (Wave C — contract probe)"
    - "#609 (Wave C — order-independence detection)"
    - "#601 (L2 Quote+ClientInvoice slice — kept as-is, sibling of #605)"
    - "#496 (closed; symmetric fixes merged via #602) — exposed both the L1 silent-mask pattern and L2 strictness drift"
    - "#449 (orthogonal coverage-expansion epic — cross-linked, not nested)"
related_prs:
    - "#602 (merged 2026-05-17) — fix attachment_id + discount.type for Quote + ClientInvoice; deferred the broader audit that this PRD owns"
---

# PRD: E2E Test Reliability + Schema Strictness Sweep

## 1. Problem & Context

### 1.1 Problem statement

qontoctl's E2E test suite has a **three-layer reliability defect**. Issue #496 — reopened twice over 2 weeks before #602 fixed it — exposed all three layers:

**Layer 1 — Failure-Visibility Defect (the disease).** The suite uses a two-stage silent mask: `if (result.isError === true) return;` swallows tool errors → leaves the CRUD-chain's shared `createdId` as `undefined` → `if (createdId === undefined) return;` swallows every downstream test. Three semantically distinct outcomes — "couldn't execute (skip)", "executed and found a bug (fail)", "executed correctly (pass)" — collapse into a single green dot. This pattern hid #496's `quote_create` schema-parse failure for ~2 weeks while the CRUD lifecycle continued reporting all-green.

**Layer 2 — Schema-Runtime Drift Detection Gap (the absent immune system).** Zod schemas in `packages/core/` encode strict assumptions (`z.string().nullable()`) that diverge from Qonto's actual API contract (`required` list semantics, where fields not in `required` may be entirely absent). There is no detection mechanism; users discover drift in production. The #496 commit explicitly deferred the broader audit — 81 occurrences across 15 core files remain unverified.

**Layer 3 — Sandbox-State Contract (the implicit dependency).** Tests assume Qonto sandbox accepts operations without precondition state. The visible `quote_has_no_attachment` HTTP 412 under suite load (passes solo, fails under load) is the smoke; equivalent preconditions exist undocumented across `quote_send`, `client_invoice` send, transfer initiation, etc. Each contributor rediscovers preconditions individually.

The **visible flake is a symptom, not the disease**. The L1 pattern is the root cause: it allowed L2 (schema bugs) to hide and obscured L3 (precondition gaps) as flake noise.

### 1.2 Why now

- #496 reopened twice (2026-05-07 → 2026-05-17) — the L1 mask is the reason it kept escaping detection
- Concrete L1 scope: **30 occurrences of `isError === true) return` across 14+ E2E files**; **~60 chained `=== undefined) return` skips across 25+ files**
- Concrete L2 scope: **81 nullable-not-optional fields across 15 core schema files**; #602 fixed only `attachment_id` + `discount.type` on two surfaces (4 of 81)
- The diagnostic is fresh — discovery context, error reproducer, and root-cause analysis are all in living memory; deferring loses fidelity
- Solo maintainer with no test-review safety net → preventive infrastructure is the only durable defense

### 1.3 In scope (v1, 2-3 weeks appetite)

**Wave A — Quick wins (3-5 days)**:

- Replace all 30 `if (result.isError === true) return;` occurrences with `it.skip("reason")` (legitimate precondition) or explicit failure (unexpected error)
- Replace silent chained-undefined skips with `it.skip("upstream-skipped: {dependency}")` carrying the upstream test's recorded reason
- Audit + remediate L2 strictness drift across all 81 occurrences (core schemas): each `nullable()` field cross-checked against Qonto's `required` list; relaxed to `nullable().optional()` where the field is not in `required`
- Add regression tests per L2 fix (mirror the #602 pattern: "accepts {field} omitted entirely (regression: #{issue})")

**Wave B — Sweep & documentation (5-7 days)**:

- Systematic sweep: enumerate every CRUD-lifecycle chain in E2E (clients, client-invoices, quotes, webhooks, insurance, cards, etc.) — audit each for L1 occurrences AND the masked-`create` failure pattern
- Author `docs/qonto-sandbox-preconditions.md` — per-write-endpoint documentation of required state (attachment for quote_update, mailbox for quote_send, etc.)
- Fix the specific `quote_update` 412 root cause by ensuring the CRUD lifecycle attaches an attachment before update, OR documenting the precondition + skipping with reason
- Cross-reference precondition docs from the relevant tests (inline comment with `docs/qonto-sandbox-preconditions.md#{anchor}`)

**Wave C — Infrastructure (5-10 days)**:

- Schema-vs-runtime contract probe: tool that hits a representative sample of Qonto endpoints with OAuth credentials, parses live responses, and diffs them against the Zod schemas to surface drift (extra fields, missing fields, type mismatches)
- Probe runs locally (OAuth-required) on demand; design decision deferred on whether/how it integrates with CI
- Test order independence verification: mechanism to run the E2E suite in shuffled order and detect outcome divergence (any test that fails under one order but passes under another flags a state-isolation bug)

### 1.4 Out of scope (explicit)

| Out                                                                                   | Why                                                                                                                                          |
| ------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| OAuth credential lifecycle / refresh-token expiry recovery                            | User-confirmed environmental (re-login handles it); not a test reliability issue                                                             |
| Deflake retry / quarantine infrastructure (retry-with-jitter, flaky-test annotations) | Convergence-driven philosophy: fix root causes, don't mask flakes with retries                                                               |
| Mocking the Qonto API in E2E                                                          | Explicitly avoided per project convention (memory: `feedback_mcp_void_formatter_trap`) — E2E exists precisely because mocks lied in the past |
| Parallel E2E execution                                                                | Sequential (`--concurrency=1`) is the chosen tradeoff; revisit only if suite >10 min                                                         |
| OAuth-required tests in CI                                                            | CI is api-key-only by design; OAuth suites are local-only; this PRD does not change that                                                     |
| New Qonto API endpoint coverage                                                       | This is reliability work on existing coverage, not coverage expansion (covered by separate scope per #449)                                   |
| Test framework migration (vitest → other)                                             | Out of scope; vitest is the locked choice                                                                                                    |
| Sandbox environment provisioning (new test orgs, seed data)                           | Defer until precondition documentation reveals a structural need                                                                             |

### 1.5 Appetite

**2-3 weeks for v1.** Three waves (A: 3-5d, B: 5-7d, C: 5-10d) sized to complete the systematic sweep + preventive infrastructure. Cap: no novel research, no Qonto-side coordination, no test framework changes. Wave C contract probe is bounded to "detect drift" not "auto-remediate"; auto-remediation is v2.

## 2. Stakeholders

| Stakeholder               | Role                                                          | Primary concerns                                                                               |
| ------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Solo maintainer (Oleksii) | Runs E2E locally; fixes test+schema defects; reviews this PRD | "Does the suite tell me the truth?"; "Am I shipping schema bugs that hide for weeks?"          |
| qontoctl end-user         | Hits production with the CLI/MCP server                       | "Why does the CLI throw a Zod parse error on a field I don't care about?" (the #496 user pain) |
| MCP/LLM clients           | Programmatic consumers of qontoctl MCP tools                  | "Why does `quote_update` return `isError: true` with an opaque schema error?"                  |
| Future contributors       | Read the test suite to understand patterns                    | "When a test skips, what was the reason? Why is the same pattern in 30 places?"                |
| CI pipeline               | Runs api-key-compatible E2E against production sandbox        | "Are E2E results stable enough to be a reliable signal?"                                       |

## 3. ORCA Object Model

### Object: `E2ETest`

One `it()` block executing against live Qonto API.

**Attributes**:

- `id` — `{domain}/{surface}.e2e.test.ts > {describe-path} > {it-title}`
- `surface` — `cli` | `mcp`
- `domain` — `quotes` | `client-invoices` | `webhooks` | etc.
- `dependency_chain` — list of prior tests whose state this test depends on (CRUD chains)
- `outcome` — `pass` | `fail` | `skip` (with recorded reason); MUST NOT be conflated

**CTAs**:

- Execute (run against live API)
- Skip-with-reason (explicit precondition not met)
- Fail-explicitly (unexpected error path)

### Object: `PreconditionGate`

Explicit guard preceding an API call. Replaces silent early-return.

**Attributes**:

- `precondition_kind` — `tool-error-on-list` (sandbox doesn't support feature) | `tool-error-on-create` (precondition not met) | `upstream-skipped` (prior test in chain skipped)
- `recorded_reason` — human-readable string surfaced in vitest report
- `link_to_precondition_doc` — optional anchor in `docs/qonto-sandbox-preconditions.md`

**CTAs**:

- Assert (fail explicitly if precondition not met)
- Skip (`it.skip("reason")` — call vitest's skip mechanism)

### Object: `ZodSchemaField`

One field declaration in a `core` Zod schema.

**Attributes**:

- `file_path`, `line_number`
- `field_name`
- `strictness_mode` — `required` | `nullable` | `nullable-optional` | `optional`
- `qonto_required_status` — present in Qonto's `required` list (true / false / unknown)

**CTAs**:

- Validate (used at runtime)
- Audit-strictness (compare against Qonto contract; flag drift)
- Fix-strictness-drift (relax `nullable` → `nullable().optional()` when not in Qonto's `required` list)

### Object: `QontoEndpointContract`

A Qonto API operation as documented + as observed in runtime.

**Attributes**:

- `method`, `path` (e.g., `PATCH /v2/quotes/:id`)
- `request_required_fields` — from docs
- `response_required_fields` — from docs
- `response_observed_shape` — from runtime probe
- `success_preconditions` — runtime observations (e.g., "PATCH requires attachment_id present")

**CTAs**:

- Probe-shape (call endpoint, capture response shape)
- Probe-precondition (intentionally violate precondition, observe error code + message)

### Object: `SchemaDriftReport`

Output of one contract-probe run.

**Attributes**:

- `endpoint_id`
- `extra_fields` — present in runtime, absent from schema
- `missing_fields` — present in schema, absent from runtime
- `strictness_mismatches` — schema strict where runtime omits, or vice versa
- `captured_at`

**CTAs**:

- Generate (run probe → diff → emit report)
- Surface (write to artifact for review)

### Object: `SandboxPreconditionDoc`

Markdown documentation of preconditions per write endpoint.

**Attributes**:

- `endpoint_id`
- `precondition_description` (e.g., "Quote PATCH requires `attachment_id` set on the quote first; create attachment via `POST /v2/quotes/{id}/attachments`")
- `failure_signature` (HTTP 412 + error key, e.g., `quote_has_no_attachment`)
- `linked_tests` — list of E2E tests that cite this doc

**CTAs**:

- Author (write the doc entry)
- Link-from-test (inline comment in test code)

### Object: `CRUDLifecycleChain`

A sequence of tests sharing module-scope state (`create → update → send → delete`).

**Attributes**:

- `chain_id` — e.g., `quotes/mcp.e2e.test.ts > MCP quote tools (e2e) > quote CRUD lifecycle (MCP)`
- `shared_state_variables` — e.g., `createdQuoteId`
- `tests` — ordered list of `E2ETest` ids
- `audit_status` — `l1-found` | `l1-remediated` | `clean`

**CTAs**:

- Audit-for-L1-pattern (scan for silent-skip occurrences)
- Remediate (replace with explicit skip-with-reason)

## 4. EARS Requirements

### 4.1 Failure visibility (L1)

- **R-FV-1 (Ubiquitous)**: The test suite SHALL NOT use the pattern `if (result.isError === true) return;` (silent early-return on tool error). Every such occurrence SHALL be replaced with either (a) `it.skip("reason")` carrying a recorded reason, OR (b) an explicit assertion that fails the test.
- **R-FV-2 (Ubiquitous)**: The test suite SHALL NOT use the pattern `if ({sharedId} === undefined) return;` for shared-state CRUD chains. Replacement: `it.skip(\`upstream-skipped: ${reason from prior test}\`)` — the chain MUST propagate the recorded skip reason.
- **R-FV-3 (State-driven)**: When a test's required precondition is not met, the test SHALL be marked `skipped` in the vitest report (visible, not silently green) with the precondition reason captured in the report.
- **R-FV-4 (Unwanted behavior)**: If a test encounters an unexpected error path (HTTP error code not enumerated in the precondition doc), the test SHALL fail explicitly — NEVER silently skip.
- **R-FV-5 (Ubiquitous)**: The systematic sweep SHALL cover at minimum the 14+ test files currently containing the L1 pattern: clients, products, client-invoices, terminals, quotes, cards, intl-transfers, statements, teams, webhooks, insurance, international, bulk-transfers, intl-beneficiaries.

### 4.2 Schema strictness (L2)

- **R-SS-1 (Ubiquitous)**: Every Zod schema field declared as `z.{type}().nullable()` without `.optional()` SHALL be audited against the corresponding Qonto endpoint's `required` list (or, where docs are silent, against runtime-observed response shape).
- **R-SS-2 (Conditional)**: When a field is NOT in Qonto's `required` list AND the schema currently declares it `nullable` (non-optional), the schema SHALL be updated to `nullable().optional()`.
- **R-SS-3 (Ubiquitous)**: Each L2 fix SHALL include a regression test using the format `parses a response with {field} omitted entirely (regression: #{issue})` — mirroring the #602 convention.
- **R-SS-4 (Ubiquitous)**: The audit SHALL cover all 81 occurrences across the 15 core schema files identified by grep.
- **R-SS-5 (Conditional)**: When an audit verdict is ambiguous (Qonto docs don't list the field in `required` AND runtime probe is unavailable), the audit entry SHALL be recorded with `verdict: ambiguous` and the conservative posture (`nullable().optional()`) SHALL be applied with a comment citing the ambiguity.

### 4.3 Sandbox preconditions (L3)

- **R-SP-1 (Ubiquitous)**: For every Qonto write endpoint with a known non-trivial precondition (412 / 422 with specific error key), `docs/qonto-sandbox-preconditions.md` SHALL contain an entry documenting: endpoint, precondition description, failure signature (HTTP + error key), and remediation path (how the E2E test sets up the precondition).
- **R-SP-2 (Ubiquitous)**: Every E2E test that depends on a non-trivial precondition SHALL link to its precondition-doc entry via inline comment (`// see docs/qonto-sandbox-preconditions.md#{anchor}`).
- **R-SP-3 (Conditional)**: When the `quote_update` test's `quote_has_no_attachment` 412 precondition can be satisfied programmatically, the test SHALL satisfy it (e.g., attach an attachment before update). When it cannot, the test SHALL `it.skip("Qonto sandbox: quote_update requires attachment_id; see docs/qonto-sandbox-preconditions.md#quote-update")`.

### 4.4 Schema-vs-runtime contract probe

- **R-CP-1 (Ubiquitous)**: A contract probe SHALL exist as an invocable tool (CLI script under `scripts/` or `pnpm` task) that, given OAuth credentials, calls a representative sample of Qonto read endpoints and compares actual response shape against the declared Zod schemas.
- **R-CP-2 (Ubiquitous)**: The probe output SHALL produce a `SchemaDriftReport` per endpoint: extra fields (in runtime, missing from schema), missing fields (in schema, absent from runtime), strictness mismatches.
- **R-CP-3 (Ubiquitous)**: The probe SHALL be invokable locally; CI integration is a design-phase decision (open question Q1 in DoR findings).
- **R-CP-4 (Optional feature)**: Where a strictness mismatch is detected, the probe SHALL suggest the corrective Zod declaration (e.g., "`attachment_id` is absent from response — change `z.string().nullable()` to `z.string().nullable().optional()`").

### 4.5 Test order independence

- **R-OI-1 (Ubiquitous)**: A mechanism SHALL exist to detect cross-test state contamination — running the E2E suite in shuffled order MUST yield the same set of pass/fail/skip outcomes as default order (modulo legitimate skip reasons changing).
- **R-OI-2 (Conditional)**: When order-shuffled run differs from default-order run, the divergent tests SHALL be flagged for state-isolation review (either share state explicitly via `beforeAll` setup, or eliminate the implicit dependency).

### 4.6 Skip reason discipline

- **R-SR-1 (Ubiquitous)**: Every `it.skip("reason")` invocation SHALL include a non-empty reason string. Empty-reason skips SHALL fail lint.
- **R-SR-2 (Optional feature)**: Skip reasons SHOULD follow a discoverable convention enabling future trend analysis (e.g., prefix categories: `sandbox-precondition:`, `upstream-skipped:`, `feature-not-supported:`, `missing-fixture:`).

## 5. Acceptance Criteria

### Scenario 1: Replacing an L1 silent-skip with explicit failure (R-FV-1, R-FV-4)

**Given** a test in `packages/e2e/src/quotes/mcp.e2e.test.ts` that currently reads:

```ts
const result = await client.callTool({ name: "quote_list", arguments: {} });
if (result.isError === true) return;
```

**When** the L1 audit + remediation Wave A is complete
**Then** the test SHALL read:

```ts
const result = await client.callTool({ name: "quote_list", arguments: {} });
if (result.isError === true) {
    return; // ← FAIL: this pattern is banned
}
```

This pattern SHALL be replaced with one of:

```ts
// Form A: precondition skip (sandbox doesn't support feature)
if (result.isError === true) {
    return it.skip("Qonto sandbox: feature-not-supported");
}
// Form B: explicit assertion (unexpected error is a test failure)
expect(result.isError, `unexpected tool error: ${firstTextFromMcpResult(result)}`).toBeFalsy();
```

**But not**:

- The test SHALL NOT silently swallow the error (regression of L1)
- The test SHALL NOT use a generic `it.skip("error")` reason (R-SR-1)
- The test SHALL NOT skip on errors that ARE in scope (legitimate failures must surface)

### Scenario 2: L2 schema audit fix with regression test (R-SS-1, R-SS-2, R-SS-3)

**Given** a Zod schema field `header: z.string().nullable()` at `packages/core/src/types/quote.schema.ts:105`
**And** Qonto's Quote response docs do NOT list `header` in `required`
**When** the L2 audit Wave A runs
**Then** the field SHALL be updated to `header: z.string().nullable().optional()`
**And** a regression test SHALL be added to the matching `.schema.test.ts`:

```ts
it("accepts a quote response with header omitted entirely (regression: L2 audit)", () => {
    const { header, ...withoutHeader } = validQuoteFixture;
    expect(() => QuoteSchema.parse(withoutHeader)).not.toThrow();
});
```

**But not**:

- The audit SHALL NOT blindly relax every field (false-positive risk); each fix SHALL cite either Qonto docs or runtime probe evidence
- The audit SHALL NOT silently widen schemas already covered by tests (the regression test makes the contract explicit)
- The audit SHALL NOT introduce `.optional()` on fields that ARE in Qonto's `required` list

### Scenario 3: Sandbox precondition documentation + test link (R-SP-1, R-SP-2, R-SP-3)

**Given** the `quote_update` MCP test that fails under suite load with HTTP 412 `quote_has_no_attachment`
**When** Wave B runs
**Then** `docs/qonto-sandbox-preconditions.md` SHALL contain:

```markdown
### `PATCH /v2/quotes/:id`

**Precondition**: Quote must have `attachment_id` set before update.

**Failure signature**: HTTP 412 with error key `quote_has_no_attachment`.

**Remediation in tests**: Create + attach attachment via `POST /v2/quotes/{id}/attachments` before invoking `quote_update`, OR skip with `it.skip("Qonto sandbox: see #quote-update")`.
```

**And** the test SHALL be either:

- Modified to attach an attachment before `quote_update`, OR
- Marked `it.skip("Qonto sandbox: quote_update requires attachment_id; see docs/qonto-sandbox-preconditions.md#patch-v2quotesid")`

**But not**:

- The test SHALL NOT continue to fail silently under suite load (regression)
- The doc SHALL NOT be silently authored without linking from the affected test (orphan doc)
- The doc SHALL NOT speculate beyond Qonto's published / runtime-observed behavior

### Scenario 4: Contract probe drift detection (R-CP-1, R-CP-2)

**Given** the contract probe tool exists and OAuth credentials are configured
**When** the probe runs against `GET /v2/quotes` and the response includes a field `e_invoicing_status` not present in `QuoteSchema`
**Then** the probe SHALL produce a `SchemaDriftReport`:

```json
{
    "endpoint": "GET /v2/quotes",
    "extra_fields": [{ "field": "e_invoicing_status", "observed_type": "string" }],
    "missing_fields": [],
    "strictness_mismatches": []
}
```

**And** the report SHALL include a suggested corrective Zod declaration
**But not**:

- The probe SHALL NOT mutate any state (read-only by construction)
- The probe SHALL NOT auto-modify schema files (suggest, don't apply — manual review required)
- The probe SHALL NOT require staging-token (OAuth alone is sufficient for read endpoints; staging-token is per-test concern)

### Scenario 5: Suite-wide L1 sweep coverage (R-FV-5)

**Given** Wave B runs the systematic sweep across the 14+ identified L1-pattern files
**When** the sweep is complete
**Then** `grep -rn "if (result.isError === true) return" packages/e2e/src/ | wc -l` SHALL return `0`
**And** `grep -rn "=== undefined) return" packages/e2e/src/ | grep -v helpers.ts | wc -l` SHALL return `0` (excluding the `helpers.ts` utility which is not test code)
**And** the chained-skip propagation pattern SHALL be implemented uniformly across CRUD chains
**But not**:

- The sweep SHALL NOT convert silent skips to silent failures (anti-pattern: replacing one mask with another)
- The sweep SHALL NOT skip lifecycle chains that have masked failures (every chain MUST be audited)

### Scenario 6: Order-independence diff detects cross-test contamination (R-OI-1, R-OI-2)

**Given** the E2E suite passes in default order
**And** a test `T` mutates module-scope state outside an explicit `LifecycleSkipCarrier` `describe` block
**When** `scripts/check-order-independence.sh` runs the suite in default order, then in shuffled order (`--sequence.shuffle --sequence.seed=$RANDOM`)
**Then** the two runs' pass/fail outcome **sets** SHALL be diffed
**And** if `T`'s pass/fail membership differs between orders, the script SHALL exit non-zero
**And** the divergent test(s) SHALL be listed for state-isolation review
**But not**:

- Skip-**reason** text differences alone SHALL NOT trigger divergence — only pass/fail set membership counts (legitimate skip reasons may differ by order)
- The script SHALL NOT classify a Qonto-sandbox-state change between runs as contamination — a divergence SHALL be re-confirmed with a second shuffled run before being reported (distinguish environmental flake from real contamination)
- The check SHALL NOT block CI (it is a pre-release local gate per Q1/Q3 design resolution — CI is api-key-only and cannot run the OAuth-gated suite)

## 6. Success Criteria

### 6.1 Leading indicators (drive execution feedback)

| Indicator                                           | Meter                                                                              | Current                       | Target                                                    |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------- | ------------------------------- |
| L1 `isError === true) return` occurrences           | `grep -rn ... packages/e2e/src/`                                                   | 30                            | 0                                                         |
| Chained `=== undefined) return` in tests            | `grep -rn ... packages/e2e/src/                                                    | grep -v helpers.ts`           | ~60                                                       | 0                               |
| `nullable()` not-`.optional()` in core schemas      | `grep -rn "z.{type}().nullable()" packages/core/src/                               | grep -v optional`             | 81                                                        | 0 deviation from Qonto contract |
| Documented sandbox preconditions per write endpoint | Count of entries in `docs/qonto-sandbox-preconditions.md`                          | 0                             | ≥1 per write endpoint with known non-trivial precondition |
| Contract probe drift report                         | Probe output: count of `extra_fields` + `missing_fields` + `strictness_mismatches` | unknown (probe doesn't exist) | <5 per endpoint (steady-state; >5 = investigate)          |

### 6.2 Lagging indicators (validate outcomes)

| Indicator                                      | Meter                                                                                     | Target                                         |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------- |
| E2E suite outcome stability on full-suite-load | Pass/fail/skip set identical across 5 consecutive runs                                    | 100% stable (no flakes)                        |
| Hidden-failure recurrence                      | Production reports of "schema parse error" or "silent test green when feature was broken" | 0 in next quarter                              |
| Contract drift detected per quarter            | Probe run quarterly; count of new drift items                                             | Indicator only — 0 over time = stable contract |
| Time-to-diagnosis for new schema bugs          | Wall-clock from user report to root-cause identification                                  | <1 day (vs ~2 weeks for #496)                  |

### 6.3 Decision gates

- **Gate A (Wave A → Wave B)**: L1 + L2 audits complete; regression tests added; CI green. If audit reveals significantly more drift than expected (>30 nullable-fix failures), pause and reassess scope.
- **Gate B (Wave B → Wave C)**: Sandbox preconditions doc covers all write endpoints with known 412/422 paths; `quote_update` 412 root cause resolved. If Wave B uncovers Qonto-side issues requiring coordination, defer those specific items and document.
- **Gate C (Wave C completion)**: Contract probe runs locally and produces a drift report. CI integration decision made (design-phase question Q1). Test order independence verification mechanism in place.

## 7. Quality Attributes (Planguage)

### 7.1 Test reliability

- **Tag**: `test-reliability`
- **Gist**: E2E suite produces deterministic pass/fail/skip outcomes across runs
- **Scale**: Stability rate = (runs with identical outcome set) / (total runs) over a rolling window
- **Meter**: 5 consecutive full-suite-load runs locally; outcome set diffed
- **Wish**: 100%
- **Target**: 100% (post-Wave-A+B)
- **Acceptable**: 95% (one tolerable flake per 20 runs, with documented sandbox-side cause)
- **Fail**: <90% (suite has masked or order-dependent defects)

### 7.2 Schema fidelity

- **Tag**: `schema-fidelity`
- **Gist**: Zod schemas match Qonto's actual API contract
- **Scale**: (Schema fields with strictness matching Qonto's `required` list OR runtime-observed shape) / (total fields)
- **Meter**: Contract probe report — counts of `extra_fields`, `missing_fields`, `strictness_mismatches`
- **Wish**: 100% (zero drift)
- **Target**: ≥95% (some drift is inevitable; alerts on >5% deviation per endpoint)
- **Acceptable**: 90%
- **Fail**: <85% (systemic drift — investigate)

### 7.3 Failure visibility

- **Tag**: `failure-visibility`
- **Gist**: Test outcomes are not silently conflated; every skip has a recorded reason
- **Scale**: Binary — zero L1 occurrences across the suite
- **Meter**: `grep -rn "if (result.isError === true) return" packages/e2e/src/` should return zero matches; `grep -rn "it.skip(\"\")" packages/e2e/src/` should return zero matches
- **Wish**: 0 occurrences
- **Target**: 0 occurrences (binary — passes or fails)
- **Fail**: ≥1 occurrence (the disease is recurring)

## 8. Cross-Cutting Concerns

### 8.1 Security

**N/A — no auth changes, no new credentials, no new data surface.** The contract probe reuses existing OAuth credentials from `.qontoctl.yaml`; no new secret storage. The sandbox-preconditions doc may reference example error responses, which MUST be redacted of any organization-identifying data (apply existing redaction conventions from `qontoctl diagnose`).

### 8.2 Compliance & Regulatory

**N/A.** This is test/schema infrastructure work; no regulated user data is collected, transmitted, or stored beyond what the existing E2E suite already touches (Qonto sandbox responses, which are user-owned). License headers (`SPDX-License-Identifier: AGPL-3.0-only` + copyright) MUST appear in any new source files per project convention.

### 8.3 Reliability & Observability

**PRIMARY focus of this PRD.** Cross-references:

- Contract probe (R-CP-1 to R-CP-4) is the observability primitive for schema drift
- Skip reason discipline (R-SR-1, R-SR-2) makes test-level reliability observable
- Sandbox preconditions doc (R-SP-1 to R-SP-3) is observability for precondition state
- Test order independence (R-OI-1, R-OI-2) is observability for cross-test contamination

**Failure modes considered**:

- Contract probe rate-limited by Qonto: design SHALL include exponential backoff + partial-report support
- OAuth credential expiry during probe run: probe SHALL detect expired credentials and surface clear error (not silent failure)
- Test order independence check itself flaky: mechanism SHALL distinguish "test failed under shuffled order" (real bug) from "Qonto sandbox state changed between runs" (environmental)

### 8.4 Performance & Scalability

**Out of scope** for this PRD. E2E suite is sequential by design (`--concurrency=1` per `feedback_e2e_before_pr` memory) and parallelism is explicitly out (§ 1.4). Contract probe runs locally on demand, not in hot path. Schema audit is one-time work + ongoing probe-driven monitoring; no scaling concern.

### 8.5 Operational

- **CI integration of contract probe** — RESOLVED in design (Q1 → LOCAL-ONLY): CI is api-key-only by design and OAuth cannot live in CI cleanly, so the probe is a local + pre-release tool added to `docs/release-runbook.md`, run quarterly. A CI job is reconsidered only if drift frequency proves high (>1 user-reported schema bug per quarter despite quarterly probe). Tracked as #608.
- **Quarterly schema audit cadence**: post-v1, the contract probe SHOULD be invoked quarterly (or pre-major-release) to catch new drift. This becomes part of the release runbook.
- **Skip reason taxonomy** (R-SR-2) is operational instrumentation — enables future trend analysis (e.g., "% of E2E test runs ended in skip-not-pass" as a release-readiness signal).
- **Sandbox preconditions doc maintenance**: when Qonto changes a precondition (e.g., adds a 2FA requirement on transfer), the doc + linked tests SHALL be updated in the same PR that adapts the test.

### 8.6 Lifecycle

- **Schema audit recurring task**: post-v1, contract probe runs quarterly. Findings become work items.
- **L1 pattern regression prevention** — RESOLVED in design (Q3 → HYBRID): `scripts/check-no-silent-skip.js` CI guard (tracked #604) bans reintroduction of `if (result.isError === true) return;`; a complementary ESLint rule for out-of-lifecycle module-scope mutable state is part of the order-independence work (tracked #609).
- **Sandbox preconditions doc**: living document, updated as new preconditions are discovered.
- **Deprecation**: this PRD's work is done when all leading indicators hit target AND a stable cadence of contract-probe runs is established. The "L1 pattern" is permanently retired from the codebase; the audit/probe infrastructure persists.

## 9. Feature Completeness Verdict

| Feature                                             | Verdict       | Notes                                                                                                                                                                                                               |
| --------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| L1 silent-mask elimination (Wave A scope)           | COMPLETE      | R-FV-1 to R-FV-5; all 30+60 occurrences enumerated; mechanical refactor with regression tests via existing vitest harness                                                                                           |
| L2 schema strictness audit (Wave A scope)           | COMPLETE      | R-SS-1 to R-SS-5; 81 occurrences enumerated; regression-test convention defined per #602                                                                                                                            |
| Sandbox preconditions documentation (Wave B scope)  | NEAR-COMPLETE | R-SP-1 to R-SP-3; coverage list "every write endpoint with known non-trivial precondition" is enumerable; exact endpoint count emerges from L1 sweep                                                                |
| `quote_update` 412 root-cause fix (Wave B scope)    | COMPLETE      | R-SP-3; two explicit alternatives (attach + update OR document + skip)                                                                                                                                              |
| Schema-vs-runtime contract probe (Wave C scope)     | COMPLETE      | R-CP-1 to R-CP-4; Q1 resolved in design (LOCAL-ONLY); Scenario 4 is the executable spec; tracked as #608                                                                                                            |
| Test order independence verification (Wave C scope) | NEAR-COMPLETE | R-OI-1, R-OI-2; Q3 resolved in design (HYBRID 3-layer); Scenario 6 added in Stage 3.5 as the executable spec; remaining gap is implementation-only (lint rule + diff script), not design ambiguity; tracked as #609 |
| Skip reason taxonomy (Wave C scope)                 | NEAR-COMPLETE | R-SR-1 enforceable via the `check-no-silent-skip.js` guard (#604); R-SR-2 taxonomy IS the `SkipKind` union (design §6.1) — convention defined, lint-enforcement of the taxonomy categories deferred                 |

**Overall verdict**: `passed-with-findings`. After Stage 2 design (Q1/Q2/Q3 resolved) and Stage 3.5 (Scenario 6 added), the prior INCOMPLETE feature is now NEAR-COMPLETE (design ambiguity removed; only implementation remains, tracked as #609). Remaining NEAR-COMPLETE items have implementation-only gaps, not specification gaps. No COMPLETE feature has hidden gaps. The original DoR findings Q1/Q2/Q3 are resolved in `docs/designs/e2e-test-reliability.md` frontmatter.

## 10. Assumptions & Risks

| ID  | Color  | Assumption                                                                                                                         | Risk if false                                                                                                             |
| --- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| A1  | Green  | Qonto's API docs `required` list is the authoritative source for "field may be omitted" semantics                                  | Medium — runtime probe is the fallback (per R-SS-5); ambiguous cases default to conservative `nullable().optional()`      |
| A2  | Green  | The 30 L1 occurrences + 60 chained-undefined occurrences enumerate the complete suite-wide pattern                                 | Low — `grep` is mechanical; false negatives unlikely                                                                      |
| A3  | Yellow | Qonto sandbox is stable enough to support a contract probe (no rate-limit blocking, no SCA-gate on reads)                          | Medium — read endpoints don't require SCA; rate-limit may need backoff                                                    |
| A4  | Green  | OAuth credentials in `.qontoctl.yaml` are sufficient for contract probe (no new OAuth scope needed)                                | Low — probe hits the same endpoints E2E already uses                                                                      |
| A5  | Yellow | `quote_update` 412 root cause is `attachment_id` missing (not some other sandbox-state precondition)                               | Medium — design phase should probe with explicit attachment + update to confirm before committing fix path                |
| A6  | Green  | The contract probe's design surface is bounded (no auto-remediation; suggest-don't-apply)                                          | Low — explicit out-of-scope item; v2 territory                                                                            |
| A7  | Yellow | All 81 nullable-not-optional occurrences are actual drift candidates (vs false positives where Qonto really does require non-null) | Medium — audit phase will distinguish; expected ~70% are drift candidates based on #602 sample (4 of 4 confirmed)         |
| A8  | Red    | The Qonto OpenAPI / docs are kept up to date with the live API                                                                     | High — historical evidence (`#496` itself) shows docs and runtime diverge; contract probe exists precisely to detect this |

## 11. Source Traceability

| Source                                                                             | Items derived                                                                  | Confidence                                            |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------- | ------------------ |
| `.tmp/scopes/e2e-test-reliability-schema-strictness.md` (10-item enriched seed)    | All 10 buckets → mapped to Waves A/B/C; out-of-scope OAuth confirmed           | B — user-authoritative                                |
| Conversation context (`/do #496` execution + post-merge findings)                  | L1 pattern diagnosis; `quote_update` 412 reproducer; chained-skip mechanism    | B — user-authoritative + direct observation           |
| `grep -rn "isError === true) return" packages/e2e/src/` (30 hits across 14+ files) | R-FV-5 sweep scope; success metric current value (30)                          | A — self-verifying                                    |
| `grep -rn "z.string().nullable()" packages/core/src/                               | grep -v optional` (81 hits across 15 files)                                    | R-SS-4 audit scope; success metric current value (81) | A — self-verifying |
| `packages/e2e/src/quotes/mcp.e2e.test.ts:140-187` (the smoking gun)                | Scenario 1 acceptance criteria; L1 mechanism documented                        | A — direct file evidence                              |
| `packages/core/src/types/quote.schema.ts:96-110` (post-#602 schema)                | Regression-test format (Scenario 2); L2 fix convention                         | A — direct file evidence                              |
| `commits/471b39e` + `commits/83e0056` (#602 merge)                                 | Deferred-audit acknowledgment; out-of-scope clarification (Wave C not in #602) | A — git history                                       |
| OpenAI cookbook + Qonto API docs (referenced by #602 comments)                     | A1 assumption (docs are authoritative for `required` lists)                    | C — secondary; cross-validated by runtime             |

## 12. Open Questions

| ID  | Question                                                                                                                                                                    | Phase to resolve                                                                                  |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Q1  | Does the contract probe run in CI (new job + OAuth secret) or local-only (nightly cron / pre-release manual)?                                                               | Design                                                                                            |
| Q2  | Sandbox preconditions: document-only OR probe-before-call (the test calls `GET /v2/quotes/:id/attachments` before `PATCH` and skips if absent)?                             | Design                                                                                            |
| Q3  | Test order independence verification mechanism: random-seed runner (vitest plugin), snapshot diff (run twice, diff outcomes), or one-time manual audit + invariant comment? | Design                                                                                            |
| Q4  | Should the skip reason taxonomy (R-SR-2) be enforced via lint, or just a convention?                                                                                        | Design (low priority)                                                                             |
| Q5  | If the L2 audit reveals fields that Qonto's docs DO list in `required` but runtime probe shows omitted — which is authoritative?                                            | Wave A execution (per-case judgment; document precedent in `docs/qonto-sandbox-preconditions.md`) |

## 13. Change Log

| Date       | Change                                                   | Source                            |
| ---------- | -------------------------------------------------------- | --------------------------------- |
| 2026-05-17 | Initial PRD authored via `/capture-requirements` Phase 6 | `/scope` execution (this session) |
