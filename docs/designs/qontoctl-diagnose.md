---
type: solution-design
date: 2026-05-12
source_prd: ../prds/qontoctl-diagnose.md
brief: ../briefs/2026-05-12-design-qontoctl-diagnose.md
status: final
tracks:
    - technical-architecture
    - api-design (MCP)
    - security
    - performance
tracks_skipped:
    - data-architecture (no persistence)
    - ux-prototype-validation (no user testing)
    - ui-visual-design (CLI is text)
    - infrastructure (existing distribution)
    - integration (Qonto already integrated)
    - ux-ia (CLI affordances conventional; light treatment in §9 only)
---

# Solution Design: qontoctl diagnose

## 1. Goals & Drivers

- A single user-facing command that answers "is my qontoctl integration in a usable state, and if not, what's wrong?"
- ≤ 3 s wall-clock for a full default-set run
- Zero ambiguity about exit semantics — 0 / 1 / 2 mean exactly "all-ok / any-fail / any-warn"
- MCP-exposed as a safe read-only tool for LLM-assisted user support
- Sensitive-data leakage is zero (whitelist enforced + CI audit)
- Reuse existing core services (auth, organization, einvoicing) rather than duplicating

## 2. Constraints

- TypeScript ESM monorepo (turborepo + pnpm); strict tsconfig (composite, exactOptionalPropertyTypes, noUncheckedIndexedAccess)
- AGPL-3.0-only headers + `(C) 2026 Oleksii PELYKH` on every new file
- Coverage manifest entries required for new `cli:` / `core:` / `mcp:` surfaces (#462 policy)
- No new runtime deps — use existing http-client, config-resolver, and service layer
- Sequential checks only in v1 (parallel is a v2 question)
- Read-only by construction (no flag can make `diagnose` mutate)

## 3. Context & Scope

External systems:

- **Qonto API** (sandbox via staging-token routing, production direct) — consumed read-only for live checks
- **MCP transport** — exposes `diagnose` tool via stdio to MCP clients (Claude Desktop, Cursor, etc.)

Boundaries:

- IN: read-only health diagnosis of one configured org/profile per invocation
- OUT: per-endpoint capability matrix, drift detection, bulk multi-org probing, automated remediation

## 4. Solution Strategy

Four shape decisions, in order of consequence:

1. **Service-layer reuse, not duplication.** `getOrganization` (`packages/core/src/services/organization.ts`) and `getEInvoicingSettings` (`packages/core/src/services/einvoicing.ts`) already exist and are tested. The diagnose runner _consumes_ them; it does not re-implement.

2. **Declarative check registry.** Each diagnostic is a self-contained object with `id`, `name`, `kind`, `requiresAuth`, `requiresStagingToken`, `redactionFields`, and a `run(ctx)` function. New checks are added by appending to a registry array — no orchestration changes needed.

3. **Whitelist-only redaction with global tripwire.** Per-check `redactionFields` declare what's allowed through. A global regex audit (over OAuth-token / API-key / PAN / full-IBAN patterns) runs after redaction in dev/test as a belt-and-suspenders check, and fails the CI redaction-audit test if anything leaks.

4. **CLI / MCP share core; differ only in shell.** `runDiagnose(ctx) → DiagnosticReport` is a pure core function. The CLI command formats it (table / JSON). The MCP tool returns it as JSON. Same logic, two surfaces.

## 5. Building Blocks

```
packages/core/src/diagnose/
├── index.ts              # public exports
├── types.ts              # DiagnosticCheck, DiagnosticResult, DiagnosticReport
├── types.schema.ts       # Zod schemas for runtime validation + MCP I/O
├── service.ts            # runDiagnose(ctx) — top-level orchestrator
├── runner.ts             # sequential execution with skip propagation
├── redaction.ts          # whitelist redactor + global tripwire
├── registry.ts           # ordered registry of all checks
└── checks/
    ├── config-resolution.ts   # static: which config file was loaded, profile, paths
    ├── auth-credentials.ts    # static: api-key + OAuth presence in config
    ├── api-key-health.ts      # live: GET /v2/organization with api-key
    ├── oauth-health.ts        # live: refresh-if-expired + GET /v2/organization with OAuth
    ├── scopes.ts              # static-mirror: scopes from config (A2 decision below)
    ├── org-metadata.ts        # live: getOrganization(client) — slug, legal_name, bank_accounts count
    ├── bank-accounts-count.ts # live: count + warn near plan limits
    ├── einvoicing-settings.ts # live: getEInvoicingSettings(client) — sending/receiving status
    └── host-routing.ts        # static: derive expected base URL from staging-token presence + verify config does not override

packages/cli/src/commands/
├── diagnose.ts              # Commander command wiring (parses flags, invokes service, formats)
└── diagnose-format.ts       # table renderer + JSON renderer (deterministic when --frozen-timestamp)

packages/mcp/src/tools/
└── diagnose.ts              # server.registerTool("diagnose", ...) — input/output schemas, calls core service
```

**Ordering invariant**: Registry order is the execution order. Static checks come first. A static-fatal failure (e.g., config file unreadable) cascades skips to all subsequent live checks via the runner — no live HTTP calls happen if static checks have already established the integration is unconfigured.

## 6. Runtime View

### 6a. Task flow (CLI invocation)

```
qontoctl diagnose [--profile X] [--auth Y] [--output table|json] [--verbose] [--frozen-timestamp]
        │
        ▼
1. Resolve config (existing config resolver)        ─┐
2. Build http client (or two: api-key + oauth)        │  Static + setup
3. Build DiagnoseContext { config, clients, profile }─┘
        │
        ▼
4. runDiagnose(ctx) ─────────────────────────────────┐
   for check in registry:                              │
     if check.kind === "static":                       │
        result = check.run(ctx)                        │
     elif check.kind === "live":                       │
        if previous-fatal-static: skip(reason)         │  Core service
        elif !auth-available-for-check: skip(reason)   │  (sequential)
        elif !staging-token-when-required: skip(...)   │
        else: result = check.run(ctx)                  │
     redacted = redact(result, check.redactionFields)  │
     append redacted to report                         │
   summary = compute counts                           ─┘
        │
        ▼
5. Format(report, outputMode)
        │
        ▼
6. Exit with code per R-EC-1..4
```

### 6b. Per-check sequence (live check example)

```
auth.oauth-health (kind=live, requiresAuth=oauth)
  │
  ├─ if oauth config absent → skip(reason: "oauth not configured")
  │
  ├─ if access token expired AND refresh token present:
  │     attempt single refresh
  │       success → continue with new token
  │       fail    → status=fail, suggested_action="qontoctl auth login"
  │
  └─ GET /v2/organization (probe call to validate token)
       200 → status=ok
       401 → status=fail, suggested_action="token rejected; re-auth"
       5xx → status=fail, suggested_action="Qonto upstream issue; retry"
       network error → status=fail, suggested_action="check network"
```

## 7. Deployment View

No new deployment. `diagnose` ships with the next qontoctl release via existing distribution (npm + Homebrew tap). CI workflow changes:

- New unit tests run in existing matrix
- New E2E tests run in existing e2e job (api-key-compatible suite)
- Coverage manifest entries register the new surfaces

## 8. Interface Contracts

### 8a. CLI

```
qontoctl diagnose [options]

  -p, --profile <name>          configuration profile to use
      --config <path>           override profile resolution
      --auth <mode>             api-key | api-key-first | oauth | oauth-first
  -o, --output <format>         table | json (default: table on TTY, json otherwise)
      --ascii                   ASCII fallback for table rendering
      --frozen-timestamp        emit captured_at: "<frozen>" for deterministic output
      --verbose                 show HTTP request/response for failed checks
      --debug                   verbose + raw bodies (with redaction)
  -h, --help                    display help
```

### 8b. MCP tool

```typescript
server.registerTool("diagnose", {
    description: "Run a read-only healthcheck against the configured qontoctl profile",
    inputSchema: z.object({
        profile: z.string().optional().describe("Profile name; uses default profile if omitted"),
    }),
    outputSchema: DiagnosticReportSchema, // re-exported from core/diagnose
});
```

The MCP tool calls `runDiagnose(ctx)` and returns the report as JSON. The tool's input schema rejects any `output` / `verbose` / `debug` flag — those are CLI-only display concerns and have no meaning to a programmatic consumer.

### 8c. Core service

```typescript
// packages/core/src/diagnose/service.ts
export interface DiagnoseContext {
    config: QontoctlConfig;
    apiKeyClient?: HttpClient;
    oauthClient?: HttpClient;
    profile: string | "default";
    frozenTimestamp?: boolean;
}

export async function runDiagnose(ctx: DiagnoseContext): Promise<DiagnosticReport>;
```

### 8d. Check shape

```typescript
// packages/core/src/diagnose/types.ts
export type CheckStatus = "ok" | "warn" | "fail" | "skip";
export type CheckKind = "static" | "live";
export type CheckAuth = "none" | "api-key" | "oauth" | "either";

export interface DiagnosticCheck {
    readonly id: string; // "domain.check", stable
    readonly name: string;
    readonly kind: CheckKind;
    readonly requiresAuth: CheckAuth;
    readonly requiresStagingToken: boolean;
    readonly redactionFields: readonly string[];
    run(ctx: DiagnoseContext): Promise<DiagnosticResult>;
}

export interface DiagnosticResult {
    readonly checkId: string;
    readonly status: CheckStatus;
    readonly detail: string;
    readonly suggestedAction: string | null;
    readonly evidence?: Record<string, unknown>; // redacted; JSON-output only
    readonly latencyMs?: number;
}

export interface DiagnosticReport {
    readonly schemaVersion: "1.0";
    readonly qontoctlVersion: string;
    readonly profile: string;
    readonly authMode: AuthMode;
    readonly configPath: string;
    readonly stagingTokenPresent: boolean;
    readonly results: readonly DiagnosticResult[];
    readonly summaryCounts: Readonly<Record<CheckStatus, number>> & { total: number };
    readonly capturedAt: string | "<frozen>";
}
```

## 9. UX (CLI affordances)

Light treatment — CLI conventions are well-established:

### Table mode (TTY default)

```
qontoctl diagnose
✓ config.resolution         loaded from ~/.qontoctl.yaml
✓ auth.credentials-present  api-key + oauth configured
✓ auth.api-key-health       200 OK (89ms)
⚠ auth.oauth-health         refreshed expired access token (148ms)
✓ auth.scopes               34 scopes granted, all common scopes present
✓ org.metadata              0909-future-club-2702 (0909 Future Club)
✓ org.bank-accounts-count   2 accounts, under plan limit (10)
✓ org.einvoicing-settings   sending=disabled, receiving=disabled
✓ routing.host-target       sandbox host (staging-token present)

Summary: 8 ok, 1 warn, 0 fail, 0 skip
Exit code: 2
```

### JSON mode (non-TTY default)

Stable key order, no trailing whitespace, one object per `DiagnosticReport`. With `--frozen-timestamp`, `capturedAt` becomes the literal string `"<frozen>"` for byte-identical reproducibility.

## 10. (n/a — UI/Visual Design track skipped)

## 11. Cross-Cutting Concepts

### 11.1 Security

- **Whitelist redaction**: `redactionFields` declared per-check. Default-deny on unknown fields in `evidence`. Global tripwire regex (OAuth tokens, api-keys, PAN, full IBAN) runs as the redactor's last step; any match logs to stderr in dev/test and aborts in CI's redaction-audit test.
- **Read-only by construction**: No write capability anywhere in the call graph. The `DiagnoseContext`'s clients only call GET endpoints.
- **MCP exposure**: same JSON shape as CLI. The MCP tool input schema rejects everything except `profile`. No flag can elevate the tool's surface.
- **Sensitive sources**: OAuth access/refresh tokens, api-keys, staging-tokens are never written into `DiagnosticResult.evidence` — they are config-layer concerns, not data the user wants in their diagnostic report.

### 11.2 Performance

- **Sequential checks**: predictable runtime; no rate-limit concerns (max ~5 live HTTP calls per run)
- **Budget**: ≤ 3 s end-to-end on a responsive sandbox; PLAN ≤ 1 s
- **No retries**: 5xx responses fail-fast with a clear suggested_action; diagnose is not the place to mask transient errors. If a user sees repeated 5xx, that's a signal to investigate Qonto's side.

### 11.3 Reliability

- **Partial failure is normal**: One failed check does not abort subsequent unrelated checks. Cascading skip only applies when a static check fatally fails (e.g., config file unreadable → all live checks skip with reason).
- **No persistence**: diagnose writes nothing to disk. No file locks, no race conditions.

### 11.4 Observability

- Per-check `latencyMs` captured for every live check
- `--verbose` exposes redacted HTTP request/response for failed/warned checks
- `--debug` adds full bodies (still redacted) — matches existing CLI conventions
- `qonto_request_id` captured per failed live check (for support escalation)

### 11.5 Testing strategy

| Layer                    | Coverage                                        | Notes                                                               |
| ------------------------ | ----------------------------------------------- | ------------------------------------------------------------------- |
| Unit (core/diagnose)     | Each `check.run()` with mocked context          | Golden output for redaction tests                                   |
| Unit (core/diagnose)     | Runner cascading skip behavior                  | "static-fatal → skip live" path                                     |
| Unit (cli)               | Output formatters                               | Golden table + JSON outputs; `--frozen-timestamp` determinism check |
| Unit (mcp)               | Tool registration + I/O schema                  | Reject non-permitted inputs                                         |
| E2E (api-key-compatible) | Happy path against real sandbox                 | Asserts ≥ 8 of 9 checks return `ok` on healthy profile              |
| E2E (api-key-compatible) | One failing path                                | E.g., bad api-key → `auth.api-key-health: fail`                     |
| CI redaction audit       | Regex scan over JSON output + recorded fixtures | Fails the build on any token/PAN/IBAN leak                          |

OAuth E2E is excluded from CI (no OAuth credentials in CI) but runs locally per the existing E2E category gates.

### 11.6 Accessibility

- ASCII fallback (`--ascii`) for terminals without unicode rendering
- Suggested-action strings are full sentences, not symbol-codes

### 11.7 Error handling

- Per-check failure does not cascade beyond its own result
- Static-fatal failure cascades skips to live checks (with explicit `skip: previous-fatal-failure` reason)
- Network errors (DNS, TCP) → `status: fail, suggested_action: "check network connectivity to {host}"`
- 5xx → `status: fail, suggested_action: "Qonto upstream issue (request id: {id}); retry"`

## 12. Architecture Decisions

| ADR-ID     | Decision                                                                                | Rationale                                                                                                    | Alternatives rejected                                                          |
| ---------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| ADR-DIAG-1 | Reuse `getOrganization` + `getEInvoicingSettings` rather than re-implementing           | Avoids drift; existing services are tested                                                                   | Re-implementing in `diagnose/` — would duplicate schema logic                  |
| ADR-DIAG-2 | Whitelist redaction per check, global tripwire as belt-and-suspenders                   | Defense in depth; whitelist alone could be incomplete                                                        | Blocklist-only — easy to miss new sensitive fields as registry grows           |
| ADR-DIAG-3 | OAuth scope check uses config-mirror, not token introspection (resolves DoR finding A2) | Qonto does not expose stable token-introspection endpoint; configured scopes are what was granted at consent | Token introspection — would require Qonto API addition; v2 if Qonto exposes it |
| ADR-DIAG-4 | Sequential checks in v1; no parallel option                                             | Predictability + rate-limit safety; max ~5 live HTTP calls anyway                                            | Parallel by default — adds complexity for no measurable benefit at this scale  |
| ADR-DIAG-5 | MCP tool input is `{ profile? }` only — no CLI-style display flags                      | Display is CLI's concern; MCP consumers want structured data                                                 | Exposing `verbose` / `debug` — invites privileged-data paths via MCP           |
| ADR-DIAG-6 | Cascading skip on static-fatal failure (e.g., unreadable config)                        | No point making HTTP calls when integration is unconfigured                                                  | Run live checks anyway — wastes time and adds noise to output                  |
| ADR-DIAG-7 | Exit code 2 for warn-only, 1 for any fail, 0 for all-ok-or-skip                         | Standard unix convention; lets CI / scripts distinguish "attention needed" from "broken"                     | Single non-zero for any non-ok — loses signal granularity                      |

## 13. Quality Requirements

(Verbatim from PRD §7 Planguage — all addressed by this design)

- **Diagnose Performance**: MUST ≤ 3 s, PLAN ≤ 1 s — design choices (sequential, max ~5 live calls, no retries) make this achievable.
- **Output Stability**: MUST byte-identical for non-time fields when state unchanged — JSON renderer sorts keys; `--frozen-timestamp` enables full byte-equality.
- **Sensitive-Data Leakage**: MUST zero — whitelist + global tripwire + CI redaction-audit test.

## 14. Risks & Open Questions

### 14.1 Feasibility summary (Phase 4.1)

| Component                               | Verdict  | Notes                                                   |
| --------------------------------------- | -------- | ------------------------------------------------------- |
| `core/diagnose/service.ts` orchestrator | FEASIBLE | Standard TS service pattern                             |
| Check registry                          | FEASIBLE | Declarative pattern used elsewhere in qontoctl          |
| Whitelist redaction                     | FEASIBLE | `http-client.ts` has redaction precedent in debug mode  |
| Config-mirror scopes check (ADR-DIAG-3) | FEASIBLE | Reads `config.oauth.scopes`; no Qonto API call needed   |
| CLI command wiring                      | FEASIBLE | Commander.js pattern repeated across all commands       |
| MCP tool registration                   | FEASIBLE | `server.registerTool` pattern repeated across all tools |
| Table + JSON formatters                 | FEASIBLE | Similar formatters across qontoctl commands             |

**All Must-Have components: FEASIBLE.** No spikes needed.

### 14.2 Risk register (Phase 4.2)

| Risk                                                          | Likelihood | Impact | Score   | Mitigation                                                                                                                                              |
| ------------------------------------------------------------- | ---------- | ------ | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Redaction whitelist is incomplete; sensitive field leaks      | 2          | 3      | 6 (MED) | Global tripwire regex audit as belt-and-suspenders; CI test fails on leak                                                                               |
| Reuse of auth.status logic forces refactor of large `auth.ts` | 2          | 2      | 4 (MED) | Extract a small focused helper (`resolveAuthStatus`) without restructuring `auth.ts` wholesale                                                          |
| OAuth refresh fails in unexpected new ways                    | 2          | 2      | 4 (MED) | Today's session exercised one failure mode; design has structured handling (`oauth-health: fail` + suggested_action). Add unit test for each known mode |
| Coverage manifest entries miss a surface                      | 1          | 2      | 2 (LOW) | Follow #462 conventions; `pnpm coverage-drift-check` catches missing entries pre-PR                                                                     |
| Qonto changes `GET /v2/organization` shape                    | 1          | 3      | 3 (LOW) | Existing service schema validates response; failure surfaces clearly                                                                                    |

**No HIGH risks.** All MED risks have explicit mitigations.

### 14.3 Open questions

None blocking. The two DoR findings from the PRD are now resolved:

- **A2 (OAuth scope introspection vs config-mirror)** → ADR-DIAG-3: config-mirror
- **Redaction whitelist field-list** → declared per-check (`redactionFields`) + global tripwire (ADR-DIAG-2)

## 15. Glossary

| Canonical Name       | Definition                                                                               | Core type                                  | CLI mention                                         | MCP mention                         |
| -------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------- | ----------------------------------- |
| **DiagnosticCheck**  | One atomic diagnostic with id, kind, auth requirements, and a run() function             | `core/diagnose/types.ts#DiagnosticCheck`   | implicit (--help lists checks)                      | implicit (described in tool schema) |
| **DiagnosticResult** | Outcome of one check (status, detail, suggested_action)                                  | `core/diagnose/types.ts#DiagnosticResult`  | one row in table; one element in JSON results array | one element in tool output          |
| **DiagnosticReport** | Output of a full diagnose run (results, summary, metadata)                               | `core/diagnose/types.ts#DiagnosticReport`  | the full table or JSON                              | the full tool output                |
| **DiagnoseContext**  | Per-run state passed to every check (config, clients, profile)                           | `core/diagnose/service.ts#DiagnoseContext` | not user-visible                                    | not user-visible                    |
| **Check kind**       | `static` (no network) or `live` (API call)                                               | `core/diagnose/types.ts#CheckKind`         | implicit in output ordering                         | n/a                                 |
| **Cascading skip**   | Static-fatal failures cause subsequent live checks to skip with `previous-fatal-failure` | `core/diagnose/runner.ts`                  | result detail                                       | result detail                       |

## 16. Requirement-to-Track Coverage Matrix

Every PRD requirement maps to ≥1 executed track. No UNCOVERED entries.

| PRD Requirement                                         | Track                        | Design Section                  |
| ------------------------------------------------------- | ---------------------------- | ------------------------------- |
| R-DC-1 (check registry mechanics)                       | Technical Arch               | § 5, § 8d                       |
| R-DC-2 (default check set ≥ 9 checks)                   | Technical Arch               | § 5 (checks/ directory listing) |
| R-DC-3 (staging-token gate on `requires_staging_token`) | Technical Arch               | § 6a, § 11.1                    |
| R-DE-1 (sequential, static-first)                       | Technical Arch               | § 6a, ADR-DIAG-6                |
| R-DE-2 (cascading skip on static-fatal)                 | Technical Arch               | § 6a, § 11.7, ADR-DIAG-6        |
| R-DE-3 (single OAuth refresh attempt)                   | Technical Arch               | § 6b                            |
| R-DE-4 (5xx → fail no retry)                            | Technical Arch + Performance | § 6b, § 11.2                    |
| R-DE-5 (read-only construction)                         | Security                     | § 11.1, ADR-DIAG-5              |
| R-DO-1 (output table/json, TTY-aware default)           | API Design (CLI)             | § 8a, § 9                       |
| R-DO-2 (status markers ✓⚠✗—; ASCII fallback)            | API Design (CLI)             | § 9, § 11.6                     |
| R-DO-3 (--verbose for failed checks)                    | API Design (CLI)             | § 8a, § 11.4                    |
| R-EC-1..4 (exit codes 0/1/2/10)                         | Technical Arch               | § 8a, ADR-DIAG-7                |
| R-RS-1 (redaction whitelist + global tripwire)          | Security                     | § 11.1, ADR-DIAG-2              |
| R-RS-2 (MCP same shape as CLI JSON)                     | Security + API Design        | § 8b, § 11.1, ADR-DIAG-5        |
| R-MC-1 (MCP `diagnose` tool, read-only)                 | API Design (MCP)             | § 8b                            |
| R-MC-2 (MCP input rejects path/arbitrary code)          | API Design (MCP) + Security  | § 8b, ADR-DIAG-5                |

**Status**: All requirements covered. Phase 6 synthesis complete, no UNCOVERED entries to escalate.
