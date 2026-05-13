---
type: requirements-brief
date: 2026-05-12
source: ../prds/qontoctl-diagnose.md
workflow: /capture-requirements
status: final
pivot_from: org-capabilities-probe (over-scoped; killed)
---

# Requirements Brief: qontoctl diagnose

## Problem Being Solved

qontoctl users hitting 401/403/422 errors have no fast way to learn **why**. `auth status` covers OAuth state alone; nothing surfaces org-level config (scopes, feature flags, plan limits, staging-token routing) in one place. Result: source-diving, guesswork, support friction. `diagnose` is the first command to run when something doesn't work.

## Key Requirements (top 7)

1. `qontoctl diagnose` runs ≥ 9 atomic checks across config, auth, org metadata, scopes, feature flags, and routing — fast (≤ 3 s) and read-only.
2. Per-check structure: status (`ok` / `warn` / `fail` / `skip`) + detail + suggested action that tells the user what to do next.
3. Exit codes: 0 (all ok), 1 (any fail), 2 (any warn) — enables CI / scripting use.
4. Output: human table on TTY, JSON on non-TTY or `--output json`.
5. OAuth expired but refreshable: single refresh attempt happens, outcome reflected as a warn; refresh failure surfaces with suggested action `qontoctl auth login`.
6. MCP exposure as read-only `diagnose` tool with same shape as CLI JSON output — no privileged data surface.
7. Sensitive-data redaction whitelist-only (deny-by-default) — verified in CI.

## Key Decisions

1. **Pivot from `org-capabilities-probe`** — that scope conflated internal QA (verdict drift) with user-facing diagnostic. This PRD focuses solely on user diagnostic; verdict drift is a separate agent-discipline concern.
2. **Read-only by construction** — no destructive probes, no SCA-gated writes, no baseline writes. Refusal to mutate is structural, not a flag.
3. **Sequential checks, no parallelism** — predictability + 1–2 s total runtime; parallel mode is v2.
4. **Diagnose does NOT replace `auth status`** — `auth status` remains as a focused OAuth-only command. `diagnose` is the superset.
5. **MCP exposure included in v1** — read-only diagnose is a natural LLM tool for "help me debug my integration"; no exposed write surface, so safe.
6. **No telemetry collection** — success metric is maintainer-adoption proxy ("first reply on a bug report = run diagnose"), no in-product instrumentation.

## Assumptions & Risks

| ID  | Color  | Risk                                                                                           |
| --- | ------ | ---------------------------------------------------------------------------------------------- |
| A1  | Green  | Existing `auth status` logic reusable as foundation                                            |
| A2  | Yellow | OAuth scope introspection availability — fallback to config-mirror if Qonto doesn't expose it  |
| A3  | Green  | `GET /v2/organization` callable with either auth                                               |
| A4  | Green  | `GET /v2/einvoicing/settings` requires only `einvoicing.read`; verified today via existing CLI |

## Stats

- **Objects**: 3 (DiagnosticCheck, DiagnosticResult, DiagnosticReport)
- **EARS Requirements**: 14 across 6 groups
- **Acceptance Criteria scenarios**: 4 (each with BUT NOT)
- **Quality Attributes (Planguage)**: 3
- **Assumptions**: 3 green / 1 yellow / 0 red
- **DoR**: `passed-with-findings` (2 findings deferred to design)
- **Appetite**: 1–2 days for v1

## Full PRD

See [qontoctl-diagnose.md](../prds/qontoctl-diagnose.md)
