---
type: design-brief
date: 2026-05-12
source: ../designs/qontoctl-diagnose.md
workflow: /design-solution
status: final
---

# Design Brief: qontoctl diagnose

## Problem

qontoctl users hitting `401/403/422` need a fast way to learn **why**. The design provides a single `qontoctl diagnose` command (also exposed as a read-only MCP tool) that runs ~9 atomic read-only checks across config, auth, org metadata, scopes, feature flags, and host routing — emitting per-check status + suggested-action and exit codes 0/1/2 for scripting.

## Key Decisions

1. **Reuse existing core services, not reimplementation** — `getOrganization` and `getEInvoicingSettings` already exist in `packages/core/src/services/`; `diagnose` consumes them. Avoids drift, keeps surface small.
2. **Declarative check registry in `packages/core/src/diagnose/`** — each check is a self-contained object (`id`, `kind`, `requiresAuth`, `requiresStagingToken`, `redactionFields`, `run`). Adding a new check is appending an entry; no orchestration changes needed.
3. **Whitelist redaction + global tripwire (ADR-DIAG-2)** — per-check `redactionFields` declares what's allowed through; global regex audit catches token/PAN/IBAN patterns as belt-and-suspenders. CI redaction-audit test fails the build on any leak.
4. **OAuth scope check uses config-mirror, not token introspection (ADR-DIAG-3, resolves DoR finding A2)** — Qonto doesn't expose stable token introspection; configured scopes are what was granted at consent. v2 can switch when/if Qonto adds the endpoint.
5. **CLI and MCP share core; differ only in shell (ADR-DIAG-1, -5)** — `runDiagnose(ctx) → DiagnosticReport` is a pure function. CLI formats it (table/JSON); MCP returns JSON. MCP input is `{ profile? }` only — no display flags exposable that could elevate the surface.
6. **Sequential checks, no parallel option in v1 (ADR-DIAG-4)** — predictable, rate-limit-safe, max ~5 live HTTP calls anyway.
7. **Cascading skip on static-fatal (ADR-DIAG-6)** — if config can't be loaded, don't make HTTP calls; emit `skip: previous-fatal-failure` for downstream live checks.
8. **Exit codes 0/1/2/10 (ADR-DIAG-7)** — 0 all-ok, 1 any-fail, 2 any-warn, 10 fatal-init.

## Design Tracks

| Track                  | Approach                                                                           | Key Trade-off                                                  |
| ---------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Technical Architecture | Service-layer reuse + declarative registry under `core/diagnose/`                  | Adds a new package directory but no new runtime deps           |
| API Design (MCP)       | Read-only tool with minimal input schema (`profile?` only); same JSON shape as CLI | Less ergonomic for MCP clients wanting flags; safer surface    |
| Security               | Whitelist redaction + global tripwire + CI audit + structural read-only            | Defense in depth costs a few hundred LOC of redactor + test    |
| Performance            | Sequential, no retries, ≤ 3 s budget                                               | No parallelism flexibility in v1; acceptable for ~5 HTTP calls |

Skipped (with rationale): Data Architecture (no persistence), Infrastructure (existing distribution), UI/Visual (CLI is text), UX Prototype Validation (no user testing for a small CLI), Integration (Qonto already integrated), full UX/IA (CLI conventions are well-established; light treatment in §9 suffices).

## Open Questions

None blocking. Two DoR findings from the PRD are now resolved:

- **A2 (OAuth scope introspection vs config-mirror)** → ADR-DIAG-3: config-mirror
- **Redaction whitelist field-list** → per-check `redactionFields` declarations + global tripwire (ADR-DIAG-2)

## Feasibility & Risk Summary

- **All components FEASIBLE.** No spikes needed.
- **No HIGH risks.** Three MED risks (redaction completeness, auth.ts refactor, OAuth refresh edge cases) all have explicit mitigations.
- **No UNCOVERED requirements.** §16 Coverage Matrix maps all 16 EARS to executed track sections.

## Full Design

See [qontoctl-diagnose.md](../designs/qontoctl-diagnose.md) for the complete specification including ADRs, glossary, and coverage matrix.
