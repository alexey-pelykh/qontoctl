---
type: prd
scope: qontoctl-diagnose
created: 2026-05-12
formulation: {}
features: {}
artifacts:
    scope_doc: ../../.tmp/scopes/qontoctl-diagnose.md
    requirements_brief: ../briefs/2026-05-12-requirements-qontoctl-diagnose.md
    design_doc: ../designs/qontoctl-diagnose.md
    design_brief: ../briefs/2026-05-12-design-qontoctl-diagnose.md
dor_status: passed-with-findings
dor_findings:
    - "A2 (OAuth scope introspection availability): verify in design phase; fall back to config-mirror if unavailable"
    - "Redaction whitelist field-list to be finalized in design from existing http-client debug mode + per-check declarations"
related_commands:
    - "qontoctl auth status (existing — diagnose calls similar logic but is a superset)"
related_issues: []
---

# PRD: qontoctl diagnose — user-facing healthcheck

## 1. Problem & Context

### 1.1 Problem statement

When a qontoctl user runs a command and Qonto returns 401/403/404/422, the user has no fast way to know **why** without source-diving. The user has to manually inspect their config, decode OAuth state, mentally cross-reference scopes against the endpoint's requirements, and guess at plan-limit / feature-flag state. `qontoctl auth status` covers OAuth specifically but not the broader "is my integration in a usable state" question.

Concrete user-facing pains:

- "Why does `card create` return 403? Am I missing a scope or hitting a plan limit?"
- "I changed profiles — am I actually pointing at the org I think?"
- "Is staging-token routing me to sandbox, or am I accidentally hitting production?"
- "My OAuth token works for some calls but not others — which scopes do I have?"

### 1.2 Why now

- Project memory notes OAuth refresh tokens can silently die (discovered 2026-05-12)
- Today's session demonstrated even the maintainer hits "is auth alive?" friction
- No competing user-facing diagnostic surface in qontoctl today
- 1–2 day feature; cost-effective compared to backlog churn from "is my integration ok?" support questions

### 1.3 In scope (v1, 1–2 days appetite)

- CLI command `qontoctl diagnose` (under `--auth` precedence + `--profile` like other commands)
- Static checks (no network): config file resolution, profile resolution, presence of api-key + OAuth credentials, staging-token presence, sca preference setting
- Live checks (read-only API): OAuth token health (single refresh attempt if expired), org metadata via `GET /v2/organization`, granted OAuth scopes (via token introspection if available, else reflected from config), e-invoicing settings, bank account count
- Output: human-readable table (TTY default) or JSON (`--output json`)
- Per-check structure: name, status (`ok` / `warn` / `fail` / `skip`), detail, suggested-action
- Exit codes: 0 (all ok), 1 (any fail), 2 (any warn but no fail)
- MCP exposure: read-only `diagnose` tool (LLM clients debugging user integrations)
- Verbose mode (`--verbose`) shows underlying HTTP request/response for failed checks
- Documentation: new `docs/troubleshooting.md` or section in `docs/configuration.md`

### 1.4 Out of scope (explicit)

| Out                                       | Why                                                                           |
| ----------------------------------------- | ----------------------------------------------------------------------------- |
| Per-endpoint probe matrix                 | Different problem (internal QA, not user diagnostic)                          |
| Drift detection / baselines               | Different problem                                                             |
| Multi-org bulk operation                  | One profile per invocation, like other commands                               |
| Replacing `qontoctl auth status`          | `diagnose` is a superset; `auth status` remains as focused OAuth-only command |
| Probing destructive / SCA-gated endpoints | Read-only by design                                                           |
| Auto-fix / remediation                    | Reports state with suggested-action strings; user remediates                  |
| Concurrent probing / parallel checks      | Sequential for predictability and 1–2 s total runtime                         |

### 1.5 Appetite

**1–2 days for v1.** Cap: single CLI command, ≤ 10 atomic checks, single MCP tool, documentation page, unit + 1–2 E2E tests, coverage-manifest entries. Excess scope (parallel probing, deep plan-limit introspection, multi-org diagnosis) deferred.

## 2. Stakeholders

| Stakeholder            | Role                   | Primary concerns                                                 |
| ---------------------- | ---------------------- | ---------------------------------------------------------------- |
| New qontoctl user      | Initial setup          | "Did I configure auth correctly?"                                |
| Existing qontoctl user | Daily ops              | "Why is this command returning 403?"                             |
| Multi-org user         | Profile switching      | "Am I pointing where I think?"                                   |
| MCP/LLM clients        | Read-only programmatic | "Can I check the user's integration before suggesting commands?" |
| Project maintainer     | Triage                 | First command to run when a user files a bug                     |

## 3. ORCA Object Model

### Object: `DiagnosticCheck`

One atomic diagnostic.

**Attributes**:

- `id` — stable string, format `{domain}.{check}` (e.g., `auth.oauth-health`, `org.metadata`)
- `name` — human-readable
- `kind` — `static` (config-only, no network) | `live` (requires API call)
- `requires_auth` — `none` | `api-key` | `oauth` | `either`
- `requires_staging_token` — bool
- `redaction_fields` — fields to redact in detail output

**CTAs**:

- Run (returns `DiagnosticResult`)

### Object: `DiagnosticResult`

Outcome of one check.

**Attributes**:

- `check_id` — references `DiagnosticCheck.id`
- `status` — `ok` | `warn` | `fail` | `skip`
- `detail` — short human string (redacted)
- `suggested_action` — string or null (e.g., "Run `qontoctl auth login` to refresh OAuth")
- `evidence` — optional structured data (redacted, JSON-output only)
- `latency_ms` — for live checks

### Object: `DiagnosticReport`

Output of a full `diagnose` run.

**Attributes**:

- `schema_version`
- `qontoctl_version`
- `profile` — profile name used (or "default")
- `auth_mode` — resolved auth preference
- `config_path` — path to loaded config file
- `staging_token_present` — bool
- `results` — list of `DiagnosticResult`
- `summary_counts` — `{ ok, warn, fail, skip, total }`
- `captured_at` — ISO-8601 timestamp

**CTAs**:

- Generate (run all enabled checks)
- Render (table for TTY; JSON for non-TTY or `--output json`)

## 4. EARS Requirements

### 4.1 Check registry

- **R-DC-1 (Ubiquitous)**: The system shall maintain a check registry where every check declares `id`, `name`, `kind`, `requires_auth`, and (when `kind: live`) `requires_staging_token`.
- **R-DC-2 (Ubiquitous)**: The default check set shall include at minimum: `config.resolution`, `auth.credentials-present`, `auth.api-key-health` (if api-key configured), `auth.oauth-health` (if OAuth configured), `org.metadata`, `org.bank-accounts-count`, `org.einvoicing-settings`, `auth.scopes`, `routing.host-target` (sandbox vs production).
- **R-DC-3 (State-driven)**: While `staging_token` is absent, checks marked `requires_staging_token: true` shall be marked `skip` with detail "staging-token not configured".

### 4.2 Execution

- **R-DE-1 (Ubiquitous)**: The system shall execute checks sequentially in registry order (static first, then live).
- **R-DE-2 (Event-driven)**: When a static check fails fatally (e.g., config file unreadable), the system shall skip all subsequent live checks with `skip: previous-fatal-failure`.
- **R-DE-3 (State-driven)**: While OAuth is configured and the access token is expired, the system shall attempt exactly one refresh before live checks; refresh outcome shall be reflected in `auth.oauth-health`.
- **R-DE-4 (Event-driven)**: When a live check encounters a 5xx, the system shall mark the result `fail` with `detail: API returned 5xx` — no retries (diagnose should be fast).
- **R-DE-5 (Unwanted behavior)**: If a check would mutate state, the system shall refuse to execute it — diagnose is read-only by construction.

### 4.3 Output

- **R-DO-1 (Ubiquitous)**: The system shall support `--output {table,json}` and shall default to `table` on TTY and `json` on non-TTY.
- **R-DO-2 (Ubiquitous)**: Table output shall use ✓ for `ok`, ⚠ for `warn`, ✗ for `fail`, — for `skip` (unicode; ASCII fallback when `--ascii`).
- **R-DO-3 (Optional feature)**: Where `--verbose` is set, failed and warned checks shall include the underlying HTTP request/response with redaction.

### 4.4 Exit codes

- **R-EC-1**: 0 — all checks `ok` or `skip`
- **R-EC-2**: 1 — any `fail`
- **R-EC-3**: 2 — any `warn` but no `fail`
- **R-EC-4**: 10 — fatal initialization error (config file unreadable, etc.)

### 4.5 Redaction & security

- **R-RS-1 (Ubiquitous)**: The system shall redact API keys, OAuth tokens (access + refresh), staging-token, full IBAN tails, and any field in a check's `redaction_fields` from all output.
- **R-RS-2 (Ubiquitous)**: MCP-exposed `diagnose` tool shall return the same structured `DiagnosticReport` as the CLI JSON output — no privileged surface.

### 4.6 MCP exposure

- **R-MC-1 (Ubiquitous)**: An MCP tool `diagnose` shall expose `DiagnosticReport.Generate` as read-only.
- **R-MC-2 (Ubiquitous)**: The MCP tool input shall accept only `profile` (optional); no flag accepts any path or arbitrary code.

## 5a. Acceptance Criteria (GWT + BUT NOT)

### Scenario 1: Happy path — all checks pass

```gherkin
Given a configured profile with valid api-key + OAuth + staging-token
When the user invokes `qontoctl diagnose`
Then the report includes results for all default checks
And every result is status: ok
And exit code is 0
And output is human-readable table on TTY (or JSON on pipe)
BUT NOT modify any persistent state
BUT NOT emit unredacted credentials in any output channel
BUT NOT prompt for SCA approval
```

### Scenario 2: OAuth expired but refreshable

```gherkin
Given a profile with valid api-key + expired OAuth (refreshable)
When `qontoctl diagnose` runs
Then `auth.oauth-health` attempts refresh and reports ok with detail "refreshed"
And other checks proceed normally
And exit code is 2 (warn — refresh happened but check was not initial-ok)
BUT NOT prompt user for re-login
BUT NOT silently overwrite stored tokens without surfacing the refresh
```

### Scenario 3: OAuth refresh failed

```gherkin
Given a profile with expired OAuth and invalid refresh token
When `qontoctl diagnose` runs
Then `auth.oauth-health` reports fail with suggested_action: "Run qontoctl auth login"
And api-key-compatible checks still execute
And exit code is 1
BUT NOT abort the entire run when only OAuth is dead
BUT NOT make further OAuth-required API calls after refresh failure
```

### Scenario 4: Profile mismatch — wrong host

```gherkin
Given a profile with staging-token set but production host configured (mis-config)
When `qontoctl diagnose` runs
Then `routing.host-target` reports warn with detail: routing mismatch
And suggested_action explains expected host
And exit code is 2
BUT NOT abort other checks
BUT NOT modify the user's config
```

## 5b. Feature Completeness

| Feature                            | Verdict                                       |
| ---------------------------------- | --------------------------------------------- |
| CLI command surface                | COMPLETE                                      |
| Check registry (≥ 9 checks for v1) | COMPLETE                                      |
| Table + JSON output                | COMPLETE                                      |
| Exit codes                         | COMPLETE                                      |
| Redaction                          | NEAR-COMPLETE (whitelist enforced in design)  |
| MCP exposure                       | COMPLETE                                      |
| OAuth refresh integration          | COMPLETE                                      |
| Documentation                      | COMPLETE                                      |
| Tests                              | COMPLETE (unit + 1–2 E2E + coverage manifest) |

## 6. Success & Telemetry Metrics

### 6.1 Leading indicators

- **DIAGNOSE-RUNTIME**
    - SCALE: wall-clock from invocation to last output line
    - METER: stopwatch
    - MUST: ≤ 3 s on a responsive sandbox profile
    - PLAN: ≤ 1 s

- **DIAGNOSE-COVERAGE**
    - SCALE: distinct failure modes (401/403/404/422/network) for which `diagnose` produces a clear suggested_action
    - PLAN: ≥ 6 distinct failure modes covered with actionable suggestions

### 6.2 Lagging indicators

- **TROUBLESHOOTING-FIRST-STEP**
    - SCALE: percentage of qontoctl issue reports where the maintainer's first reply is "run `qontoctl diagnose` and paste output"
    - PLAN: ≥ 50% within 1 quarter of v1 ship
    - (Measured by maintainer's own pattern adoption — no telemetry collection)

### 6.3 Decision gates

- v1 ships only after:
    - All 9 default checks implemented and unit-tested
    - E2E exercises happy path + at least one failing-check path
    - Redaction-audit test in CI
    - `docs/troubleshooting.md` mentions diagnose as first step

## 7. Quality Attributes (Planguage)

**TAG: Diagnose Performance**

- SCALE: wall-clock for default check set on responsive profile
- METER: stopwatch
- MUST: ≤ 3 s
- PLAN: ≤ 1 s

**TAG: Output Stability**

- SCALE: byte-identical JSON output for back-to-back invocations modulo time fields
- METER: `diff -u out1.json out2.json` after `--frozen-timestamp`
- MUST: identical for all non-time fields when state unchanged

**TAG: Sensitive-Data Leakage**

- SCALE: any unredacted token / api-key / sensitive-id in any output channel
- METER: regex audit in CI over produced JSON
- MUST: zero leakage

## 8. Assumption Registry

| ID  | Assumption                                                                                               | Confidence | Verification                                                                    |
| --- | -------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------- |
| A1  | Existing `auth status` logic is reusable as the foundation for `auth.*` checks                           | Green      | Read `packages/cli/src/commands/auth.ts` during design                          |
| A2  | OAuth scope introspection is available via Qonto API (or scopes are reliably mirrored from local config) | Yellow     | Verify in design phase; fall back to config-mirror if introspection unavailable |
| A3  | `GET /v2/organization` is always callable with either api-key or OAuth                                   | Green      | Used elsewhere in qontoctl (`org show` exists)                                  |
| A4  | `GET /v2/einvoicing/settings` requires only `einvoicing.read` scope and is sandbox-compatible            | Green      | Already used today via existing CLI                                             |

## 9. Cross-Cutting & Non-Functional Concerns

### 9.1 Security

- Whitelist-only redaction (deny-by-default for fields not in an allowlist)
- Tokens, api-keys, full IBAN, sensitive IDs masked in all channels (TTY, JSON, MCP)
- MCP boundary exposes the same surface as CLI JSON — no privileged data path
- Redaction-audit test runs in CI

### 9.2 Compliance & Regulatory

- AGPL-3.0-only headers on new files; `(C) 2026 Oleksii PELYKH`
- No personal data captured (org metadata only; redact membership emails if present)
- N/A — no end-user PII handled

### 9.3 Reliability & Observability

- Partial-failure expected (exit code 2 for warn-only, exit 1 for any fail)
- Per-check latency captured for telemetry baseline
- `--verbose` exposes request/response for failed checks (with redaction)
- `--debug` matches existing CLI conventions

### 9.4 Performance & Scalability

- Per Planguage §7 — ≤ 3 s for full default set
- Sequential checks (no parallel) — predictability over speed
- N/A — single-org, single invocation only

### 9.5 Operational

- No persistent state written (diagnose is read-only)
- Tests:
    - Unit: check registry validation, redaction logic, output formatters
    - E2E: against real sandbox; happy path + one failing path
    - Coverage manifest entries for `cli:diagnose`, `core:diagnose/service.ts#diagnose`, `mcp:diagnose`
- Documentation: new `docs/troubleshooting.md` page; linked from `README.md` and `docs/configuration.md`

### 9.6 Lifecycle

- `schema_version` field on `DiagnosticReport` (semver, bumps on shape change)
- Check IDs are stable contracts — renames require deprecation cycle (alias new ID to old for 1 release)
- New checks: PR-reviewed registry addition; default-set inclusion is a separate decision

## 10. Source Traceability

| Section                | Source                                                                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1 Problem            | Verbatim user pushback "Is this org capabilities have any practical use in real life except the tests?" + project memory on OAuth refresh-token death |
| 1.3 Default check set  | Pain enumeration in §1.1 + existing `auth status` precedent                                                                                           |
| 4.1-4.2 Check registry | Pattern derived from existing qontoctl service architecture                                                                                           |
| 4.5 Redaction          | CLAUDE.md security conventions + existing redaction in http-client debug mode                                                                         |
| 4.6 MCP exposure       | Read-only MCP-tool pattern from existing `qontoctl` MCP server                                                                                        |
| 6 Success metrics      | Maintainer-adoption proxy (no telemetry collection in v1)                                                                                             |
| 9 Cross-cutting        | Standard qontoctl conventions per CLAUDE.md                                                                                                           |
