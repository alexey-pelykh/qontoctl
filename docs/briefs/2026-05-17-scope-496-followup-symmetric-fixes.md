---
type: scope-brief
date: 2026-05-17
workflow: /scope
status: final
---

# Scope Brief: #496 Follow-up — Symmetric schema-alignment fixes

## Problem

External reporter `max-carlo` confirmed two Zod schema validation failures on `qontoctl` against the live Qonto API ([#496 comment](https://github.com/alexey-pelykh/qontoctl/issues/496#issuecomment-4470471274), 2026-05-17): `quote_list` rejects responses where `discount.type === "absolute"` (fixed-amount discounts), and `quote_update` rejects PATCH responses that omit `attachment_id` entirely. Both are cases where qontoctl's schemas are stricter than the Qonto API's actual contract.

A docs deep-dive established that Qonto's quote-endpoint OpenAPI docs are internally inconsistent with their client-invoice-endpoint docs (`amount` vs `absolute` for the same field), and that Qonto's `required` lists for both `Quote` and `ClientInvoice` schemas explicitly omit `attachment_id` plus 8+ other fields where qontoctl currently uses `z.string().nullable()`. The reported symptoms are the tip of a broader docs-vs-schema gap.

## What's In Scope

### Wave 1 (Must — ship now)

1. **#496 (reopened)** — Symmetric schema-alignment fixes. One PR covers:
    - `QuoteDiscountSchema.type` → `z.enum(["percentage", "absolute", "amount"])` (3-value forward-compat)
    - `QuoteSchema.attachment_id` → `.nullable().optional()`
    - `ClientInvoiceDiscountSchema.type` → same 3-value enum (parallel docs-aligned fix)
    - `ClientInvoiceSchema.attachment_id` → `.nullable().optional()`
    - Mirroring TypeScript types in `quote.ts` and `client-invoices/types.ts` (per `satisfies z.ZodType<T>` constraint)
    - Regression tests in `quote.schema.test.ts` and `client-invoices/schemas.test.ts`

### Wave 2 (Should — after #496 ships)

2. **#601 (new)** — Audit nullable-vs-optional alignment for Quote + ClientInvoice schemas vs OpenAPI required lists. Per-field decision (relax vs keep-strict-with-rationale) for the 8+ Quote fields and parallel ClientInvoice fields not in the docs `required` list. Deferred until #496 baseline established.

## Key Decisions

1. **Symmetric tier (1 PR, both surfaces)** — bundled `quote.*` and `client_invoice.*` fixes in one PR rather than split. Rationale: docs precedent (client-invoice docs use `absolute` canonically), code precedent (PR #514 bundled multiple schema-alignment fixes), and the client-invoice `absolute` gap is latent — fixing it preemptively avoids a second user report.
2. **3-value enum `[percentage, absolute, amount]`** — accepts every value seen across Qonto docs (quote docs: `amount`, client-invoice docs: `absolute`) AND the live API (`absolute`). Maximum forward-compat against either docs being right; resilient to Qonto's own internal cleanup.
3. **Reopen #496, ship with `Fixes #496`** — preserves the reporter's conversation context (raw curl evidence, locale info, web-app provenance) and the owner's deferred-Q&A trail. Cleaner than orphaning the new info in a fresh issue.
4. **Broader nullable-vs-optional retrofit deferred to #601** — investigation found 8+ Quote fields with the same too-strict pattern, but symmetric scope kept tight. Filing the audit follow-up explicitly prevents the gap from being forgotten.
5. **Test strategy: unit-only, no new E2E** — sandbox quotes likely don't carry `absolute` discounts (E2E wouldn't catch this regression naturally), so regression coverage lives in `*.schema.test.ts` per project precedent (#507).

## Stats

- **Work Items**: 2 in GitHub Issues
    - #496 (reopened): READY, Tier B Gherkin AC pending test binding
    - #601 (new): READY, typed exception (`formulation: skipped — audit task`)
- **Ready**: 2/2
- **Gaps accepted**: 0 (one typed exception on #601, fully documented)
- **Deferred**: 0
- **Total Gherkin scenarios**: 8 (mapped 1:1 to vitest test cases)

## Side artifact

A parallel skill-config issue was filed during this scoping session: [alexey-pelykh/.claude#688](https://github.com/alexey-pelykh/.claude/issues/688) — `qonto-api` skill has stale URLs (`openapi_v2.yml` 404, wrong slug for quote PATCH). Independent of #496 / #601; surfaced because the qontoctl-side deep-dive couldn't use the skill's cited URLs as-is.

## Project conventions to respect during execution

- `(fix)` lowercase commit prefix with `(#496)` issue ref (per CLAUDE.md § Commit Messages).
- `pnpm format:check` first, then `lint`, `build`, `test`, `test:e2e` (full OAuth-inclusive suite) — per auto-memories `feedback_pnpm_format_check_first` + `feedback_e2e_before_pr`.
- Merge via `gh pr merge --rebase --admin --delete-branch` only — per `project_merge_method_rebase_only` (repo disallows squash + merge-commit).
- Poll PR checks via `--json bucket`, treat `skipping` as terminal-benign — per `feedback_gh_pr_checks_skipping_bucket`.

## Next Steps

- `/do #496` — execute the symmetric fix (highest priority)
- After #496 merges: `/do #601` — kick off the broader audit

Both items are READY for immediate execution.
