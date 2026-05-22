# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **`@qontoctl/core`**: new `packages/core/src/quotes/` service-layer module — `sendQuote(client, id, payload): Promise<void>` issues `POST /v2/quotes/{id}/send` with the JSON-serialised payload as the request body. Establishes the service seam quotes previously lacked (the existing `quote_list` / `quote_create` etc. MCP tools and CLI commands called `HttpClient.requestVoid` / `HttpClient.get` directly), bringing quotes into structural parity with `client-invoices/`. Foundation for #638 (which wires the MCP `quote_send` tool + CLI `quote send` command through this service to close the historical `quote_send` HTTP 422 `invalid_body: EOF` bug). The Qonto API contract requires `send_to` and `email_title`; `copy_to_self` defaults to `true` server-side and `email_body` is optional (#637).
- **`@qontoctl/core`**: `SendQuoteRequestPayload` TS type + `SendQuoteRequestPayloadSchema` Zod schema, mirroring the Qonto OpenAPI `SendQuoteRequestPayload` shape exactly (`send_to: string[]`, `copy_to_self: boolean` with schema-level `.default(true)`, `email_title: string`, optional `email_body: string`). Unknown fields stripped on parse. No additional client-side validation (`min(1)` etc.) is layered at the core boundary — those belong to the MCP-tool / CLI-command inputSchemas that wrap this schema (see #638, #639). Both type and schema exported from `@qontoctl/core` (#637).
- **`@qontoctl/core`**: `SendClientInvoiceRequestPayload` TS type + `SendClientInvoiceRequestPayloadSchema` Zod schema — identical shape to the quotes-side payload, since both endpoints accept the same OpenAPI `SendRequestPayload` schema. Both type and schema exported from `@qontoctl/core` (#637).
- **Docs**: migration guide at [`docs/migrations/sendClientInvoice-payload.md`](docs/migrations/sendClientInvoice-payload.md) for `@qontoctl/core` consumers affected by the breaking `sendClientInvoice(client, id) → sendClientInvoice(client, id, payload)` signature change. Documents the before/after call shape, links to the authoritative Qonto OpenAPI reference, and points at `SendClientInvoiceRequestPayloadSchema` as the canonical input validator (#639).
- **Docs**: `docs/qonto-sandbox-preconditions.md` § Client Invoices gains a `POST /v2/client_invoices/{id}/send` entry under anchor `#post-v2-client-invoices-id-send`, mirroring the existing `POST /v2/quotes/{id}/send` section. Catalogs the documented sandbox-precondition (client invoice must be finalized; recipient mailbox must be routable) and points readers at the sharpened E2E triage in `packages/e2e/src/client-invoices/{cli,mcp}.e2e.test.ts` so the HTTP 422 `invalid_body: EOF` regression cannot reappear as a silent skip (#639).

### Changed

- **`@qontoctl/core`**: **BREAKING** — `sendClientInvoice(client, id)` is now `sendClientInvoice(client, id, payload: SendClientInvoiceRequestPayload)`. Earlier versions called `POST /v2/client_invoices/{id}/send` with no body, which the Qonto API rejects with HTTP 422 `invalid_body: EOF` — the parallel-bug class to the `quote_send` 422/EOF surfaced during the #636 investigation. The new signature accepts the payload required by the Qonto contract; consumers must adjust call sites to provide `send_to` and `email_title` at minimum. TypeScript surfaces a compile error at the prior call shape, making the migration mechanical. See [`docs/migrations/sendClientInvoice-payload.md`](docs/migrations/sendClientInvoice-payload.md) for the consumer migration guide; internal MCP/CLI call sites are wired through to the new payload by #639 (#637, #639).
- **`@qontoctl/mcp`**: `client_invoice_send` tool inputSchema now requires `send_to: string[]` (one or more recipient emails, validated as emails with `min(1)`) and `email_title: string` (non-empty subject); optional `email_body: string` and `copy_to_self: boolean` (defaults to `true`). The tool forwards these through the breaking-signature `sendClientInvoice` (introduced in #637) so the request body is serialized verbatim with `Content-Type: application/json`. Replaces the placeholder payload (`{ send_to: [], email_title: "" }`) that #637 shipped to keep the build compile-green pending #639. Tool description now states the requirements (#639).
- **`@qontoctl/cli`**: `client-invoice send <id>` now accepts `--to <email...>` (variadic; repeat the flag or space-separate values; at least one required), `--title <subject>` (required, non-empty), `--body <text>` (optional), and `--no-copy-self` (commander negation; omitting the flag keeps the server-side default of `true`). Validation runs before the service call — missing `--to` or `--title` exits with a clear stderr error and exit code 1, no HTTP request issued. Replaces the placeholder payload that #637 shipped pending #639 (#639).
- **`@qontoctl/mcp`** + **`@qontoctl/cli`** **(BREAKING)**: `quote_send` MCP tool and `quote send` CLI command now require a typed payload. The MCP tool's `inputSchema` adds `send_to: string[]` (min 1, email-validated), `email_title: string` (min 1), optional `email_body: string`, and optional `copy_to_self: boolean`. The CLI command adds `--to <email...>` (repeatable, at least one required), `--title <subject>` (required), `--body <text>` (optional), and `--no-copy-self` (default: copy). Both surfaces validate inputs before issuing the HTTP call — Zod rejects malformed/empty inputs at the MCP boundary; the CLI emits a clear stderr error and exits non-zero. **Migration**: callers of `quote_send` / `quote send` must pass `send_to` + `email_title` (or `--to` + `--title`). Earlier invocations that omitted these will fail at the input boundary instead of producing the historical `invalid_body: EOF` 422 (#638).
- **Security** — **`@qontoctl/core`**: invert the debug-log redaction mechanism in `packages/core/src/http-client.ts` from an exact-name _denylist_ (`SENSITIVE_FIELDS`) to an _allowlist_ (`LOGGABLE_FIELDS`) with catch-all redaction. The denylist failed open: any future Qonto schema field with a synonym of an already-sensitive name — `email_address` vs `email`, `tax_id` vs `tax_identification_number`, `phone` / `mobile` vs `phone_number` — would silently skip redaction and leak PII into debug logs, with nothing in code or tests to flag it; the denylist had to be manually chased on every API-surface change. `redactSensitiveFields` now redacts every primitive leaf whose key is not explicitly allowlisted as operational and never-PII (resource `id` / `kind` / `status` / timestamps, `amount` / `currency`, the visible-by-design corporate `name` / `vat_number`, and the non-secret HTTP transport headers); payload structure stays visible, only leaf values are masked. New schema fields are redacted **by default** — the failure mode inverts from "a PII field leaks silently" (invisible) to "a safe field is over-redacted" (a visible test failure). The #647 visible-by-design carve-out for a corporate entity's `name` and `vat_number` is preserved and guarded by a test. All five debug-log call sites (request body, response body, request headers, response headers, primary-auth-error body) continue to share the one redaction helper by reference. Debug-log _output_ only — request/response payloads sent to the Qonto API are untouched; previously-visible borderline fields now redact (the `email_title` subject line, the transaction `label`), and arrays of sensitive values (`send_to`) redact element-wise. The denylist→allowlist choice — over a hybrid denylist + key-pattern heuristics, or value-shape heuristics, both of which still fail open — is documented inline at the `LOGGABLE_FIELDS` declaration. Closes the mechanism-level LOW finding from the `security-architect` pre-merge reviews of PR #645 / PR #649 (#650).

### Fixed

- **`@qontoctl/mcp`** + **`@qontoctl/cli`**: `client_invoice_send` / `client-invoice send` now succeed end-to-end against the Qonto API. Pre-#637 the endpoint was called via `client.requestVoid("POST", "/v2/client_invoices/{id}/send")` with no body, which the API rejects with HTTP 422 `invalid_body: EOF` (parallel-bug class to #636 arm 1 on the quotes side; surfaced during the #636 investigation). #637 introduced the breaking-signature `sendClientInvoice(client, id, payload)` and shipped placeholder payloads to keep the build compile-green; #639 lands the proper end-user flag wiring (`send_to` / `email_title` / `email_body` / `copy_to_self`) at both the MCP tool and CLI command boundaries, plus unit-test body-content assertions that pin the request payload verbatim (regression guard) (#639).
- **E2E**: `client_invoice_send` E2E triage sharpened (parallel to #638's `quote_send` discipline) — the test no longer absorbs any tool error as a `sandbox-precondition` skip. A defensive sandbox-precondition path is retained: only HTTP 4xx errors whose stderr matches the historical client-mailbox pattern (`client.*(mailbox|email)|contact_email|missing.*email|no.*recipient|invalid.*email`) skip with a `sandbox-precondition` reason; anything else (including the historical HTTP 422 `invalid_body: EOF`) fails the test as a regression guard. The opt-in `QONTOCTL_E2E_SEND_EMAIL=true` env gate is preserved; recipient is overridable via `QONTOCTL_E2E_SEND_EMAIL_TO` for sandboxes with a no-bounce mailbox. **The defensive triage is asymmetric to the `quote_send` parallel** — #638 removed the equivalent triage after empirical re-probe on 2026-05-22 confirmed the historical mailbox precondition is artefact under the typed-payload contract; the analogous re-probe on `client_invoice_send` is blocked by `client_invoice_create`'s invoicing-IBAN precondition (#539), so the precondition status here is unverified. By symmetry of the OpenAPI `SendRequestPayload` shape, the precondition is likely stale here too; the defensive path remains pending re-probe. Catalog entry added at `docs/qonto-sandbox-preconditions.md#post-v2-client-invoices-id-send`. See #643 for the reconciliation rationale (#639, #643).
- **Coverage manifest**: graduate `cli:packages/cli/src/commands/client-invoice.ts` from `pending` to `covered` and refresh notes on `mcp:client_invoice_send` and `core:packages/core/src/client-invoices/service.ts#sendClientInvoice` to reflect the new signature + sharpened E2E triage (#639).
- **`@qontoctl/mcp`** + **`@qontoctl/cli`**: `quote_send` MCP tool and `quote send` CLI command no longer fail with HTTP 422 `invalid_body: EOF` against the Qonto API. The previous implementation called `POST /v2/quotes/{id}/send` with no body, but the Qonto OpenAPI contract for that endpoint requires a `SendQuoteRequestPayload` (`send_to[]` + `email_title`). Both call sites now route through `@qontoctl/core`'s `sendQuote` service (#637) with the typed payload supplied by the caller. Empirical sandbox probe (2026-05-22) confirmed the positive path now returns success; the prior "client must have non-empty email" sandbox-precondition turned out to be an artefact of the empty-body call shape and no longer applies under the typed-payload contract (`docs/qonto-sandbox-preconditions.md#post-v2-quotes-id-send` updated accordingly). **The parallel `client_invoice_send` endpoint (#639) shares the same OpenAPI `SendRequestPayload` shape**; by symmetry its precondition is likely stale too, but the analogous empirical re-probe is blocked by `client_invoice_create`'s invoicing-IBAN precondition (#539) — its E2E test therefore retains a defensive sandbox-precondition triage pending re-probe. See #643 for the cross-endpoint reconciliation rationale. Closes #636 arm 1; arm 2 (`send-for-signature` mode) remains the scope of #636 (#638, #643).
- **`@qontoctl/e2e`**: sharpened `quote_send` triage discipline. The pre-#638 E2E tests (`packages/e2e/src/quotes/{cli,mcp}.e2e.test.ts`) masked the #636 arm-1 422/EOF for ~2 weeks by absorbing any tool error as a `sandbox-precondition` skip — same #496 failure class re-emerging in a different cell. The new tests assert success on the positive path and surface any non-precondition error (including a regression to 422/EOF) as a test failure; per the 2026-05-22 empirical re-probe the precondition path is gone entirely on the quote side, so no `sandbox-precondition` skip remains here (vs the parallel `client_invoice_send` test which keeps a defensive triage pending re-probe — see the cross-endpoint reconciliation in #643). The MCP test additionally adds a schema-level regression guard that exercises the missing-`send_to` Zod rejection, preventing a silent return to the empty-body call shape (#638, #643).
- **Security** — **`@qontoctl/core`**: redact request-body PII before emitting to the `console.debug` request-logging site. The request-body call site (`packages/core/src/http-client.ts`) was bypassing the existing `redactSensitiveFields` / `SENSITIVE_FIELDS` mechanism that already protected response bodies, request headers, and response headers — JSON request bodies were stringified verbatim into debug output. Now wired through the same redaction helper, mirroring the established pattern; `FormData` bodies remain a `[FormData]` placeholder. Two PII fields added to `SENSITIVE_FIELDS`: `send_to` (recipient-email array on the `quote_send` / `client_invoice_send` endpoints introduced in #637-#639) and `email` (singular field on beneficiary and client records). The stringified body passed to `fetch()` itself is unchanged — only the debug-log view is redacted. Coverage of natural-person PII fields (`first_name`, `last_name`, `tax_identification_number`, address fields) is **deferred to #647** to avoid over-redacting visible-by-design fields without a dedicated audit pass. Surfaced by the `security-architect` pre-merge review of #640 (#644).
- **Security** — **`@qontoctl/core`**: extend `SENSITIVE_FIELDS` to redact natural-person PII in request- and response-body debug logs. Same bug class as #644 (PR #645) — broader surface across the Qonto write-endpoint schemas the `security-architect` pre-merge review of #645 flagged as still leaking. Ten field names added: `first_name`, `last_name`, `tax_identification_number`, `phone_number`, plus the address components `address`, `street_address`, `city`, `zip_code`, `country_code`, `province_code`. These cover the natural-person identification surface of `Client` / `ClientInvoiceClient` / `QuoteClient` / `CreditNoteClient` (top-level fields and nested `billing_address` / `delivery_address` blocks); `phone_number` is the documented field on the Qonto `ClientUpsert` request body. The corporate-name `name` field and business `vat_number` are intentionally NOT redacted — both are visible-by-design for operational debugging of B2B records, a judgment call documented inline at the `SENSITIVE_FIELDS` declaration. Comment alongside the constant also notes the future-direction consideration (exact-name-match → allowlist-of-safe-fields + catch-all redaction, the security LOW finding from the #645 review chain) without changing the mechanism in this PR — deliberately deferred. Three positive- and negative-containment tests added to `http-client.test.ts` mirroring the #644 four-test pattern: top-level natural-person PII redaction, top-level + nested address-component redaction (verifying recursive walk), and a guard that the visible-by-design fields stay readable. Surfaced by the `security-architect` pre-merge review of #645 (#647).

## [2.0.4] — 2026-05-22

### Added

- **`@qontoctl/core`**: new `OAuthNoTokenError` typed-error subclass of `AuthError` thrown by `buildOAuthAuthorization` when OAuth credentials are present but the access token is empty (no value yet — pre-login state or post-revoke). Subclass discrimination enables both (a) widening the HTTP client's fallback gate to cover the "OAuth wired but never logged in" case alongside `OAuthRefreshError` (was the third missing fallback arm — see § Fixed), and (b) mode-specific error formatting at the CLI/MCP edge that points users at `qontoctl auth login` and the `--auth api-key` escape hatch (was previously surfacing the generic AuthError handler's misleading "Verify your API key credentials" hint). Exported from `@qontoctl/core` (#631).
- **`@qontoctl/core`**: `selectAuthChain` now returns an optional `fatal?: { mode, reason }` discriminator on its `AuthChainSelection` shape, populated for `api-key` and `api-key-first` preferences when the available credentials carry an `apiKeyInvalidReason` (`"empty-slug"` or `"empty-secret"`). Pure data — `selectAuthChain` does not throw; the caller (`@qontoctl/cli`'s `createClient`) inspects `selection.fatal` and throws a typed `ConfigError("VALIDATION")` before HttpClient construction. `oauth` and `oauth-first` preferences intentionally do NOT populate `fatal` even when the api-key fallback is invalid — respects the explicit primary selection. New exported types: `AvailableCredentials` (with optional `apiKeyInvalidReason`) and `ApiKeyInvalidReason` union (#631).
- **`@qontoctl/core`**: declare `deposit_amount` on `ClientInvoiceSchema` — surfaced as genuine `extra_fields` drift by the v2.0.4 pre-release contract-probe run (report `.tmp/contract-probe/2026-05-22T07-13-48-661Z.json`). Observed as `null` on `/v2/client_invoices`; declared as permissive `z.unknown().nullable().optional()` since the populated runtime shape is undocumented — follows the same single-sample precedent used by #621 and #630 for fields whose non-null structure is not yet known. Mirrored TypeScript `ClientInvoice` interface gains `deposit_amount?: unknown`. +1 regression line in `scripts/contract-probe.test.ts` pins the schema accepts the field. Additive (loosens parser); no caller break.

### Fixed

- **`@qontoctl/core`**: OAuth-first fallback now correctly degrades to the api-key fallback when the OAuth access token is absent (no token yet from `auth login`, or empty after revoke), not only when token refresh fails. The HTTP client's `Promise.any` branch was previously gated on `OAuthRefreshError` only; an empty access token bubbled up the generic `AuthError` thrown by `buildOAuthAuthorization`, missed the fallback gate, and surfaced to the user as an authentication failure despite valid api-key credentials being configured. The gate is now widened to `(err instanceof OAuthRefreshError || err instanceof OAuthNoTokenError)`, mirroring the symmetry of the two OAuth-side failure modes. Closes arm 1 of #631 (#631).
- **`@qontoctl/cli`**: `api-key` and `api-key-first` modes now fail closed at config-load time with a typed `ConfigError("VALIDATION")` when the api-key credentials are present-but-invalid (empty `organization_slug` or empty `secret_key`), rather than silently degrading to OAuth (`api-key-first`) or producing a runtime `AuthError` from `buildApiKeyAuthorization` (bare `api-key`). The fatal-config guard executes before `HttpClient` construction so the user sees a configuration error with setup guidance, not a misleading API authentication error. `oauth` and `oauth-first` modes are intentionally NOT affected — the user's explicit primary choice is respected, and the invalid api-key fallback is left as a no-op slot. Closes arm 3 of #631 (#631).
- **`@qontoctl/cli`** + **`@qontoctl/mcp`**: error handlers for `OAuthNoTokenError` now dispatch BEFORE the generic `AuthError` handler (subclass dispatch order matters — `OAuthNoTokenError extends AuthError`, so reversed order would have the generic handler swallow it). The dedicated handler emits "Run `qontoctl auth login`" plus the `--auth api-key` escape hatch instead of the generic handler's misleading "Verify your API key credentials" secondary line. The MCP-side handler additionally surfaces the MCP-args escape hatch (`"--auth", "api-key"` in `.mcp.json` `args`) since MCP users cannot interactively run `auth login` from within the MCP server process. Closes arm 4 of #631 (#631).

### Changed

- **`@qontoctl/cli`**: `qontoctl --help` now annotates the `--auth` flag with `(default: "oauth-first")`, mirroring the existing `-o, --output (default: "table")` annotation. Previously the default was discoverable only via `qontoctl diagnose` (which reports `authMode: "oauth-first"` in its evidence block) — users running `--help` saw only the choices list with no indication which mode applied when the flag was omitted. The description text also gains a semantic crib (`*-first modes fall back when primary is unavailable`) so the distinction between bare-mode and `*-first` mode is visible at the flag level. Applied at all three `--auth` option-definition sites (`program.ts`, `inherited-options.ts`, `commands/diagnose.ts`). The `diagnose` command's `--auth` Option also gains a `.choices([...AUTH_PREFERENCES])` call — the previous description text inlined the valid values, and the new format delegates rendering to Commander, so this restores the `(choices: ...)` enumeration in `qontoctl diagnose --help` (parity with the other two sites; mode-name typos now rejected at parse time at this site too). `program.opts().auth` continues to resolve to `undefined` when the flag is omitted, preserving the `CLI flag > env > config > built-in default` precedence chain in `resolveAuthPreference` (#631).

## [2.0.3] — 2026-05-20

### Added

- **`@qontoctl/core`**: declare 19 previously-undeclared API fields surfaced by the first post-#619/#624/#625/#626 production-grade contract-probe run (sandbox 2026-05-20, report `.tmp/contract-probe/2026-05-20T07-38-*.json`). Per-schema additions: `OrganizationSchema` (12: `id`, `name`, `locale`, `legal_share_capital`, `legal_country`, `legal_registration_date`, `legal_form`, `legal_address`, `address`, `legal_sector`, `contract_signed_at`, `legal_number`); `CardSchema` (4: `shipped_lost_at`, `eligible_for_renewal`, `eligible_for_upsell`, `is_qcp`); `ClientSchema` (2: `extra_emails`, `e_invoicing_reachable`); `SupplierInvoiceSchema.request_transfer` nullability tightened from `z.unknown().optional()` to `z.unknown().nullable().optional()` (the runtime parser already accepted null via `z.unknown()`; the explicit `.nullable()` lets the probe's introspection classify the field correctly). All declared `.nullable().optional()` so the schema accepts production + sandbox shapes without making over-strong type guarantees: scalar primitives typed accordingly; the undocumented-shape `OrganizationSchema.address` declared as permissive `z.record(z.string(), z.unknown())`; `ClientSchema.extra_emails` declared as `z.array(z.unknown())` since the item shape (plain string vs `{email, type}` object) is undocumented. Mirrored TypeScript types updated for `Organization` and `Client` interfaces. +5 regression tests in `scripts/contract-probe.test.ts` (one per schema + a BUT-NOT guard proving brand-new undeclared fields still flag). Additive (loosens parser); no caller break. Why now: these fields were INVISIBLE to the pre-#619 probe (wrapper-short-circuiting introspection); the now-fully-fixed probe surfaces them as the natural next batch of additive declarations following the #621 pattern (#630).
- **`@qontoctl/core`**: declare 40 previously-undeclared API fields across `BeneficiarySchema` (1: `currency`), `QuoteSchema` (2: `stamp_duty_amount`, `organization`), `ClientInvoiceSchema` (17: `number`, `purchase_order`, `invoice_url`, `discount_conditions`, `late_payment_penalties`, `legal_fixed_compensation`, `amount_paid`, `performance_date`, `performance_start_date`, `performance_end_date`, `finalized_at`, `paid_at`, `invoice_type`, `stamp_duty_amount`, `payment_methods`, `credit_notes_ids`, `organization`), and `SupplierInvoiceSchema` (20: `supplier_id`, `issuer_name`, `description`, `total_amount_credit_notes`, `initiator_id`, `attachment_category`, `analyzed_at`, `request_transfer`, `self_invoice_id`, `is_attachment_invoice`, `is_attachment_non_financial`, `has_duplicates`, `available_actions`, `has_discrepancies`, `einvoicing_lifecycle_events`, `meta`, `approval_workflow`, `is_credit_note`, `related_invoices`, `has_suggested_credit_notes`). Surfaced as genuine `extra_fields` drift by the post-#616-fix contract probe live run (report `.tmp/contract-probe/2026-05-18T14-47-13-127Z.json`). All declared `.nullable().optional()` so the schema accepts the live response without making over-strong type guarantees: scalar primitives (string/number/boolean) typed accordingly; complex shapes whose API surface is undocumented (`organization`, `available_actions`, `meta`, `approval_workflow`) declared as permissive `z.record(z.string(), z.unknown())`; array-of-unknown-shape fields (`payment_methods`, `einvoicing_lifecycle_events`, `related_invoices`) declared as `z.array(z.unknown())`; amount-shaped fields (`amount_paid`, `total_amount_credit_notes`) reuse the existing `Amount` sub-schema. `BeneficiarySchema`'s preprocess now also hoists `bank_account.currency` to the top level (mirroring the existing `iban`/`bic` hoist) so sandbox and production environments surface the field consistently. Mirrored TypeScript types updated for each `satisfies z.ZodType<T>` constraint. +5 regression tests pin the schemas accept the previously-extra-field set, with a BUT-NOT guard proving a hypothetical brand-new undeclared field still flags. Additive (loosens parser); no caller break (#621).

### Fixed

- **`qontoctl` (umbrella)**: stop overwriting the committed `packages/qontoctl/README.md` with the root `README.md` at pack time. The umbrella's `prepack` previously ran `cp ../../README.md ../../LICENSE .`, which silently discarded the detailed npm-facing README authored in #637 (full feature list including Cards, Webhooks, Payment Links, Insurance, International Transfers, plus the comprehensive MCP tools table) on every `pnpm pack` / `npm publish`. The committed file is now authoritative; npm visitors get the rich detail instead of the slim project-landing README. Local `pnpm pack` in `packages/qontoctl/` no longer leaves a dirty working tree. Matches the pattern already used by `core`, `cli`, and `mcp` (which only `cp ../../LICENSE .`) (#618).
- **Tooling**: `pnpm contract-probe` — `ZodPipe` direction-aware unwrap in `walkKeys` and the descent helpers. `z.preprocess(fn, innerSchema)` materialises as a `ZodPipe` whose `in` (raw input) and `out` (post-preprocess) types may diverge; the pre-fix walker descended the wrong branch on output validation, silently dropping fields produced by the preprocess (e.g., `BeneficiarySchema`'s `bank_account.currency` hoist). The fix routes descent through `_zod.def.out` so the post-preprocess shape is what's diffed against live responses. Closes #623 (#626).
- **Tooling**: `pnpm contract-probe` — `ZodReadonly` unwrap in `walkKeys` and the descent helpers. `z.array(X).readonly()` and similar `.readonly()`-wrapped sub-schemas are neither `ZodObject` nor `ZodArray`, so the pre-fix walker treated them as leaves — fields nested inside the wrapped subtree never surfaced as drift. Mirrors the `ZodDefault` / `ZodOptional` / `ZodNullable` unwrap pattern. Closes #622 (#625).
- **Tooling**: `pnpm contract-probe` — `ZodDefault` unwrap in the two non-`walkKeys` helpers (`unwrapForDescent`, `unwrapToObject`). Sibling fix to #619 (SL-1): a field declared `z.object({...}).default({...})` (or `z.array(...).default([...])`) was not descended because both helpers exhausted the 16-iteration cap or returned the `ZodDefault` wrapper (neither `ZodObject` nor `ZodArray`). Both now add a `ZodDefault` branch that descends `_zod.def.innerType`, folded into the existing OR chain alongside `ZodOptional` / `ZodNullable` (#624).
- **Tooling**: `pnpm contract-probe` — `ZodDefault` + `ZodPipe` unwrap in `walkKeys`. The initial fix for the wrapper-short-circuit class of introspection gaps: top-level walkKeys descent treated `z.object({...}).default({})` and `z.preprocess(fn, X)` as opaque leaves, hiding undeclared fields inside the wrapped subtree from drift detection. Adds the unwrap chain that the subsequent #624/#625/#626 fixes extended to other Zod wrappers. Together these four fixes were prerequisite to the live drift discovery surfaced in #621 (40 fields) and #630 (19 fields). Closes #616 (#619).

## [2.0.2] — 2026-05-18

### Added

- **Tooling**: `pnpm contract-probe` — schema-vs-runtime drift detector that probes Qonto GET endpoints with OAuth credentials, diffs live responses against Zod schemas exported from `@qontoctl/core`, and emits a `SchemaDriftReport[]` to `.tmp/contract-probe/{ISO8601}.json` plus a console summary table. Read-only by construction (GET-only endpoint catalog at `scripts/contract-probe.endpoints.json`); suggest-don't-apply (never edits schema files — emits corrective Zod declarations as text for maintainer review). Local-only per design (CI is api-key only — see `docs/designs/e2e-test-reliability.md §8.1`); maintainers should run it quarterly and before each release (see `docs/release-runbook.md` § Contract probe). Typed exit codes: 0 = clean, 1 = drift detected (scriptable), 2 = OAuth expired/missing, 3 = config/network error. Implements PRD requirements R-CP-1..R-CP-4 (#608).
- **Tooling**: `pnpm order-independence-check` — pre-release diff guard that detects E2E test order-dependencies by running the suite under shuffled file ordering and comparing pass/fail signatures against the canonical baseline. Catches lifecycle-carrier coupling that would otherwise silently mask failures. Pairs with the lifecycle-carrier invariant lint (now run suite-wide) and a CI regression guard (#607).

### Fixed

- **`@qontoctl/core`**: L2 schema-strictness audit — relax 48 nullable-not-optional fields across `QuoteSchema` (33 fields: top-level + nested `QuoteItem`, `QuoteAddress`, `QuoteClient`) and `ClientInvoiceSchema` (15 fields: nested `ClientInvoiceItem`, `ClientInvoiceAddress`, `ClientInvoiceClient`). Fields whose `required:` declaration in Qonto's OpenAPI does NOT include them — i.e., fields the API MAY omit entirely — are now `.nullable().optional()` (was previously `.nullable()`-only, which rejected omission). Mirrored TypeScript types updated; +48 regression tests. Additive (loosens parser); no caller break (#601).
- **`@qontoctl/core`**: L2 schema-strictness audit — relax 34 nullable-not-optional fields across 11 core schemas (`Organization`, `Card`, `SupplierInvoice`, `Transaction`, `TransactionLabel`, `Client`, `Label`, `Membership`, `PaymentLink`, `RequestBase`, `RequestTransfer`). Same R-SS-1 pattern as #601 — fields whose Qonto OpenAPI `required:` declaration omits them (i.e., fields the API MAY omit entirely) are now `.nullable().optional()`. Mirrored TypeScript types updated for each `satisfies z.ZodType<T>` constraint. Additive (loosens parser); +34 regression tests (#604).
- **`@qontoctl/core`**: `QuoteSchema` and `ClientInvoiceSchema` — extend `discount.type` enum to accept `"absolute"` (Qonto's `/v2/quotes` endpoint returns this for fixed-amount discounts despite the endpoint docs declaring only `[percentage, amount]`; the client-invoice endpoint docs use `"absolute"` canonically for the same semantic — reported with raw curl evidence in #496). `attachment_id` relaxed to `.nullable().optional()`. Additive (loosens parser) (#496).

## [2.0.1] — 2026-05-15

### Fixed

- **`qontoctl` (umbrella)**: bundle the full dependency closure — `@qontoctl/cli`, `@qontoctl/mcp`, their transitive `@qontoctl/core`, and all 3rd-party deps (`commander`, `yaml`, `@clack/prompts`, `@modelcontextprotocol/sdk`, `zod`, `proper-lockfile`, and their transitives) — into the umbrella tarball at release time. Restores `brew install qontoctl/tap/qontoctl` reliability immediately after every release. Homebrew's `npm install` step injects `--min-release-age=1` (day) by default as a supply-chain hardening measure; multi-package `pnpm -r publish` ships all four `@qontoctl/*` packages within ~11 seconds, so the umbrella's `^2.0.0` registry deps fail the age filter for ~24 hours after every release (observed against v2.0.0: install error `No matching version found for @qontoctl/cli@^2.0.0 with a date before {now-1d}`). The release workflow now uses `pnpm deploy` with the hoisted linker to materialize a self-contained tree, then `pnpm pack` from that tree produces a tarball containing real `node_modules/` (driven by `bundleDependencies: ["@qontoctl/cli", "@qontoctl/mcp"]` on the umbrella's `package.json`). At install time `npm install` finds every dep locally and never queries the registry — `--min-release-age` has nothing to filter on. A CI guard added to `.github/workflows/release.yml` asserts the full closure is present on every release. See `docs/release-runbook.md` § Why the umbrella is self-contained (#597, #599).

## [2.0.0] — 2026-05-13

Coordinated bump across all four packages — `@qontoctl/core`, `@qontoctl/cli`, `@qontoctl/mcp`, and `qontoctl` (umbrella). This is a **MAJOR** release driven by multiple BREAKING changes (see § Changed): `@qontoctl/mcp` SCA-required response shape (8 write-tool families); `@qontoctl/core` + `@qontoctl/cli` env-overlay scope tightening; `@qontoctl/core` bulk-transfer + recurring-transfer request shapes; `@qontoctl/core` deterministic config path resolution (CWD auto-discovery removed); `@qontoctl/core` bank-account update HTTP method (PUT → PATCH). **`qontoctl` (umbrella) inherits MAJOR**. See [`docs/release-runbook.md`](docs/release-runbook.md) for the semver decision framework and [§ Migration from v1.x](#migration-from-v1x) below for upgrade guidance.

### Added

- **`@qontoctl/cli`**: `sca-session show <token>` subcommand to inspect SCA session status (#431).
- **`@qontoctl/cli`**: `sca-session mock-decision <token> <allow|deny>` subcommand for sandbox-only SCA decision injection (#431).
- **`@qontoctl/cli`**: `--config <path>` global flag for explicit configuration file selection. Highest-precedence resolution source; warns on stderr if it disagrees with `QONTOCTL_CONFIG_FILE` or `--profile` (#480).
- **`@qontoctl/cli`**: `--sca-auto-approve` global flag for sandbox-only single-process SCA. When set against the sandbox, the CLI auto-approves the SCA challenge inline instead of returning a session token for two-step continuation. Production never auto-approves (#577).
- **`@qontoctl/cli`** + **`@qontoctl/mcp`**: `qontoctl diagnose` CLI command and `diagnose` MCP tool — whole-integration health check covering credential resolution, sandbox routing, token expiry, OAuth scope catalog, optional connectivity probe, with PII redaction in output (#578).
- **`@qontoctl/cli`** + **`@qontoctl/mcp`**: Qonto Terminals (POS) API support — `terminal list` and `terminal show` (CLI), `terminal_list` / `terminal_show` (MCP). New command/tool family (#484).
- **`@qontoctl/cli`** + **`@qontoctl/mcp`**: Qonto Products API support — `product list` / `product show` (CLI), `product_list` / `product_show` (MCP). New command/tool family (fc9ddba).
- **`@qontoctl/mcp`**: `sca_session_show` MCP tool to inspect SCA session status (#432).
- **`@qontoctl/mcp`**: `sca_session_mock_decision` MCP tool for sandbox-only SCA decision injection (gated to sandbox mode) (#432).
- **`@qontoctl/mcp`**: `executeWithMcpSca` wrapper module enabling bounded SCA polling (`wait` knob) and two-step `sca_session_token` continuation across MCP write tools (#433).
- **`@qontoctl/mcp`**: `QONTOCTL_CONFIG_FILE` honored at MCP server startup as the only mechanism for pointing at a non-default config file (MCP has no CLI flags) (#482).
- **`@qontoctl/core`** + **`@qontoctl/cli`** + **`@qontoctl/mcp`**: `scaMethod` / `X-Qonto-2fa-Preference` exposure through `createClient`, the hidden `--sca-method` CLI flag, and MCP server config. Auto-defaults to `mock` when a sandbox staging token is present and no method is otherwise set; production never auto-defaults. The MCP server resolves the method from env/config only — it is intentionally not exposed as a tool input (#447).
- **`@qontoctl/core`** + **`@qontoctl/cli`**: extended OAuth scope catalog (cards, teams, webhooks, e-invoicing, payment links, insurance, international transfers, recurring transfers, SCA flows) and improved auth UX in `auth setup` / `auth login` flows (#478).
- **`@qontoctl/core`** + **`@qontoctl/cli`** + **`@qontoctl/mcp`**: explicit auth precedence control via the `auth.preference` config field (`api-key` / `api-key-first` / `oauth` / `oauth-first`), the `--auth <mode>` CLI flag, and the `QONTOCTL_AUTH` env var. Default is `oauth-first` (OAuth primary with api-key fallback when OAuth fails). MCP server resolves from env/config only — not exposed as a tool input. See [`docs/configuration.md`](docs/configuration.md) § Authentication precedence (#523).
- **Docs**: PSD2 Article 5 SCA token request-binding verification recorded in `docs/security/sca-token-binding.md` (#438).
- **Docs**: Release runbook (`docs/release-runbook.md`) covering semver decision framework, npm publish flow, and Homebrew tap update (#435).
- **Docs**: Canonical configuration reference at [`docs/configuration.md`](docs/configuration.md) covering deterministic resolution chain, per-field env overlay, profile semantics, and migration guidance (#482).

### Changed

- **`@qontoctl/core`** + **`@qontoctl/cli`** + **`@qontoctl/mcp`** **(BREAKING)**: deterministic configuration-file resolution. The pre-`v2.0.0` CWD walk-up auto-discovery is **removed**. The resolver now uses (highest precedence first): `--config <path>` (CLI only) → `QONTOCTL_CONFIG_FILE` env var (CLI **and** MCP) → `~/.qontoctl/{profile}.yaml` (when `--profile <name>` is passed) → `~/.qontoctl.yaml` (home default). **Migration**: callers relying on a `.qontoctl.yaml` in the current working directory must adopt one of: (a) the `direnv` shim (`.envrc.example` → `.envrc` in the repo) that exports `QONTOCTL_CONFIG_FILE="$PWD/.qontoctl.yaml"`; (b) pass `--config ./.qontoctl.yaml` per invocation; (c) move credentials to `~/.qontoctl.yaml` or `~/.qontoctl/{profile}.yaml`. Atomic writes + advisory file locking added on the writer path so a half-written config file is never observable; restrictive `0600` permissions enforced on writes. See [`docs/configuration.md`](docs/configuration.md) (#479, #480, #482).
- **`@qontoctl/core`** + **`@qontoctl/cli`** + **`@qontoctl/mcp`** **(BREAKING)**: `updateBankAccount` now uses `PATCH` (was incorrectly using `PUT`). The Qonto API endpoint for partial bank-account updates is `PATCH /v2/bank_accounts/:id`; the previous `PUT` request worked only because the sandbox happened to accept it. **Direct HTTP consumers** of the wire shape (i.e., users not going through `@qontoctl/core`) must update their request method (#563).
- **`@qontoctl/core`** + **`@qontoctl/cli`** **(BREAKING)**: env-overlay scope tightened so env vars carry **inputs the tool reads**, never **runtime-mutable state the tool writes back**. `QONTOCTL_REFRESH_TOKEN` (and the profile-prefixed `QONTOCTL_{PROFILE}_REFRESH_TOKEN`) is **no longer read** — refresh tokens are rotated on every refresh, and env-overlay would shadow rotation on subsequent reads, so persistence anywhere was effectively defeated by env. `QONTOCTL_ACCESS_TOKEN` is **kept with read-only / discard-after-use semantics**: the env-supplied bearer is honored for the current invocation only — `oauth-authorization-factory` does not trigger proactive refresh and does not persist refreshed tokens to disk when the access token came from env (mirrors `AWS_SESSION_TOKEN`; if the token has expired the API surfaces a `401`). `applyEnvOverlay`'s parameter and return contract are narrowed via a new `EnvOverlayConfig` type that excludes runtime-mutable OAuth fields (`refreshToken`, `accessTokenExpiresAt`, `scopes`) — re-introducing a runtime-mutable env var now requires a deliberate type widening, not a runtime regression. `ConfigResult` gains a new `oauthAccessTokenFromEnv: boolean` field used by `@qontoctl/cli`'s `createClient` and `@qontoctl/mcp`'s `getClient` to thread the read-only signal into `createOAuthAuthorization`'s new `readOnly?: boolean` option. **Migration**: callers relying on `QONTOCTL_REFRESH_TOKEN` (which never worked correctly anyway — refresh results were discarded by env shadowing) must move to file-based OAuth credentials (`.qontoctl.yaml` or `~/.qontoctl/{profile}.yaml`) or use API-key env vars (`QONTOCTL_ORGANIZATION_SLUG` + `QONTOCTL_SECRET_KEY`) for CI. Council Verdict #2 (security / SRE / technical / CLI-conventions lenses) confirmed unanimous alignment with industry precedent: zero major CLI (`gh`, `aws`, `gcloud`, `kubectl`, `op`, `npm`, `docker`, `heroku`, `vercel`) accepts a refresh token via env var (#495).
- **`@qontoctl/core`**: loader hygiene — an empty or comment-only CWD `.qontoctl.yaml` (whose YAML parses to `null`) now falls back to `~/.qontoctl.yaml` instead of short-circuiting on the empty CWD file. Subordinate to the env-overlay change above; previously the asymmetry could mask credential resolution surprises (#495).
- **`@qontoctl/mcp`** **(BREAKING)**: SCA-required (HTTP 428) responses across the eight MCP write-tool families (`transfer_*`, `intl_transfer_*`, `internal_transfer_*`, `bulk_transfer_*`, `recurring_transfer_*`, `card_*`, `beneficiary_*`, `request_*` — every operation that triggers SCA) no longer return the legacy dead-end text response. Tools now accept optional `wait` (number 0–120, or `false`) and `sca_session_token` input parameters and return a structured SCA-pending response on poll-timeout that references the new `sca_session_show` and `sca_session_mock_decision` tools. Callers parsing the previous text response must adapt to the new shape (#428).
- **`@qontoctl/core`** + **`@qontoctl/cli`** + **`@qontoctl/mcp`** **(BREAKING)**: bulk-transfer create request shape corrected against the official Qonto API spec for `POST /v2/sepa/bulk_transfers`. Body is now flat (`{ bank_account_id, bulk_transfers, vop_proof_token }` — no top-level wrapper). Each item now requires `client_transfer_id` (UUID, auto-generated by CLI/MCP when omitted), `amount` as a decimal string, and `reference`; the previous extraneous `currency` per-item field is removed (the source bank account dictates the currency). CLI gains a required `--debit-account <id>` flag and an optional `--vop-proof-token <token>`; without the token the CLI auto-resolves it via `bulk_verify_payee`. The MCP `bulk_transfer_create` tool input schema gains `bank_account_id` and `vop_proof_token` (auto-resolved when omitted, except on SCA retry per PSD2 dynamic linking). Prior to this fix, the CLI/MCP `create` paths produced HTTP 400 against the Qonto API (#487).
- **`@qontoctl/core`** **(BREAKING)**: `CreateRecurringTransferParams.amount` is now `string` (was `number`). The Qonto API for `POST /v2/sepa/recurring_transfers` rejects numeric `amount` with `not_a_string: amount must be a string`. Direct callers passing a number must convert with `String(amount)` or `amount.toFixed(2)`. CLI and MCP tooling are updated to handle this transparently (see § Fixed) (#486).
- **`@qontoctl/core`** **(BREAKING)**: `CreateRecurringTransferParams` gains a required `vop_proof_token: string` field. The Qonto API for `POST /v2/sepa/recurring_transfers` rejects requests missing the token with `401 vop_proof_token_missing`. The token is sent at the top level of the request body alongside the `recurring_transfer` envelope (mirrors single-transfer's shape). Direct callers must pass a token obtained from `verifyPayee` covering the beneficiary; CLI/MCP auto-resolve when omitted (see § Fixed) (#486).

### Fixed

- **`@qontoctl/core`**: SCA-retry now skips `vop_proof_token` auto-resolution. The original (pre-SCA) request's `vop_proof_token` is reused verbatim on retry per PSD2 RTS Art. 5 dynamic linking (the token is bound to the original payment intent — re-resolving on retry would break the binding). CLI/MCP wrappers capture the auto-resolved token in a closure before the SCA challenge so the dynamic-linking property holds (#437).
- **`@qontoctl/cli`**: `cards` CLI pagination loop now terminates correctly when the Qonto API response omits `next_page` (previously the loop could spin if `next_page` was undefined rather than explicitly `null`) (#489).
- **`@qontoctl/mcp`**: `transfer_cancel` and `recurring_transfer_cancel` now wrapped in `executeWithMcpSca` for consistency with the rest of the MCP write-tool family — both endpoints can trigger SCA when the cancellation requires it (#500).
- **`@qontoctl/core`**: SCA-retry idempotency-key drift in `executeWithSca` — both the original 428 attempt and the SCA-approved retry now carry the same `X-Qonto-Idempotency-Key` header. Without this fix, retries without an explicit `--idempotency-key` could create duplicate operations (#429).
- **`@qontoctl/core`**: `mockScaDecision` URL corrected and request body removed to match the Qonto sandbox API (#446).
- **`@qontoctl/core`**: `build428Error` now throws a typed error on unknown 428 response shape, surfacing clearer diagnostics instead of silently falling through (#445).
- **`@qontoctl/core`**: 428 responses with `code: "sca_not_enrolled"` are now distinguished from `code: "sca_required"` and surface a typed `ScaNotEnrolledError`, allowing callers to react differently (#448).
- **`@qontoctl/core`**: Beneficiary `trust`/`untrust` operations now use `PATCH` (was incorrectly using `POST`) (#444).
- **`@qontoctl/core`**: `createBulkTransfer` now serializes the request body as a flat object (`{ bank_account_id, bulk_transfers, vop_proof_token }`) per the Qonto API spec — previously wrapped in a non-existent `bulk_transfer` envelope and used `transfers` instead of `bulk_transfers`, causing HTTP 400 across CLI and MCP `bulk-transfer create` paths (#487).
- **`@qontoctl/cli`**: `bulk-transfer create` now accepts `--debit-account <id>` (required) and `--vop-proof-token <token>` (optional, auto-resolved via `bulk_verify_payee` when omitted), and auto-generates per-item `client_transfer_id` UUIDs when the input file does not supply them. The JSON file format drops `currency` (currency is dictated by the source bank account) and accepts `amount` as a number or decimal string (#487).
- **`@qontoctl/mcp`**: `bulk_transfer_create` input schema corrected — accepts `bank_account_id`, `bulk_transfers` (renamed from `transfers`), and `vop_proof_token` (auto-resolved via `bulk_verify_payee` when omitted, except on SCA retry where PSD2 RTS Art. 5 dynamic linking requires the caller to supply the original token) (#487).
- **`@qontoctl/core`**: `createRecurringTransfer` now serializes `amount` as a string per the Qonto API spec for `POST /v2/sepa/recurring_transfers`. Previously the field was emitted as a JSON number, causing HTTP 400 (`not_a_string: amount must be a string`) against the live API. `CreateRecurringTransferParams.amount` is now typed as `string` (BREAKING for direct callers — see § Changed) (#486).
- **`@qontoctl/core`**: `createRecurringTransfer` now sends `vop_proof_token` at the top level of the request body alongside the `recurring_transfer` envelope (mirrors single-transfer's shape — `POST /v2/sepa/transfers` accepts `{ vop_proof_token, transfer: {...} }`). Without this, the Qonto API rejects the request with `401 vop_proof_token_missing`. `CreateRecurringTransferParams.vop_proof_token` is a required field (BREAKING for direct callers — see § Changed) (#486).
- **`@qontoctl/cli`**: `recurring-transfer create` no longer applies `Number(...)` to `--amount`; the value is passed through as a decimal string (numeric inputs are coerced to two-decimal form) (#486).
- **`@qontoctl/cli`**: `recurring-transfer create` gains an optional `--vop-proof-token <token>` flag; when omitted, the CLI auto-resolves the token via `verify_payee` against the beneficiary's IBAN/name and surfaces non-MATCH results as warnings on stderr. The auto-resolved token is captured in a closure variable BEFORE the SCA challenge, so PSD2 RTS Art. 5 dynamic linking holds across the inline `executeWithCliSca` retry (#486).
- **`@qontoctl/mcp`**: `recurring_transfer_create` input schema accepts `amount` as a number or decimal string and normalizes numeric inputs to a 2-decimal string before sending to the Qonto API (#486).
- **`@qontoctl/mcp`**: `recurring_transfer_create` input schema gains optional `vop_proof_token` (auto-resolved via `verify_payee` when omitted, except on SCA retry where PSD2 RTS Art. 5 dynamic linking requires the caller to supply the original token). Non-MATCH VoP results (`MATCH_RESULT_NO_MATCH`, `MATCH_RESULT_NOT_POSSIBLE`, `MATCH_RESULT_CLOSE_MATCH`) are surfaced as a second content block alongside the recurring-transfer JSON for LLM caller signaling (#486).
- **`@qontoctl/core`**: `cancelRecurringTransfer` now uses `requestVoid` instead of `client.post` to handle the API's `204 No Content` response shape. Previously `cancel` would throw `Unexpected end of JSON input` on success because `client.post` unconditionally tries to parse the empty body as JSON (#486).
- **`@qontoctl/core`**: `cancelTransfer` (single SEPA transfer) now uses `requestVoid` instead of `client.post` to handle the API's `204 No Content` response shape — same defect pattern as the `cancelRecurringTransfer` fix in #486. Previously `cancel` would throw `Unexpected end of JSON input` on success; the existing unit test masked this by mocking `jsonResponse({})` (a valid empty-object JSON body) instead of a true 204 No Content response (#499).
- **`@qontoctl/core`**: `RecurringTransfer` schema now treats `note`, `status` as optional and `next_execution_date` as nullable. The Qonto sandbox is observed to omit `note`/`status` from `POST /v2/sepa/recurring_transfers` responses and to return `next_execution_date: null` after a successful cancel; the previous strict-string schema caused `Invalid API response` errors against valid live responses. The `RecurringTransfer` TypeScript type is updated accordingly (`note?: string`, `status?: string`, `next_execution_date: string | null`) (#486).
- **`@qontoctl/core`**: align international transfer Zod schemas with actual sandbox API response shapes — relaxes previously over-strict fields that caused `Invalid API response` errors against valid live data. Additive (loosens parser); no caller break (#488).
- **`@qontoctl/core`**: `ClientSchema` now accepts individual (non-company) clients where the `name` field is absent. Additive (loosens parser) (#496).
- **`@qontoctl/core`** + **`@qontoctl/cli`** + **`@qontoctl/mcp`**: align `insurance-contracts` Zod schemas and CLI/MCP surface with actual Qonto API responses. Additive (loosens parser) (#509).
- **`@qontoctl/core`**: align `Membership`, `Beneficiary`, `CreditNote`, and `ClientInvoice` schemas with actual API response shapes — fields previously typed as required-string are now optional/nullable where the API may omit them. Additive (loosens parser) (#514).
- **`@qontoctl/core`** + **`@qontoctl/cli`** + **`@qontoctl/mcp`**: align webhook Zod schema and CLI/MCP surface with the actual Qonto API. Additive (loosens parser) (2005b22).
- **`@qontoctl/core`** + **`@qontoctl/cli`** + **`@qontoctl/mcp`**: align internal-transfer Zod schema and CLI/MCP surface with actual Qonto API. Additive (loosens parser) (8d40fa6).
- **`@qontoctl/core`** + **`@qontoctl/cli`** + **`@qontoctl/mcp`**: align attachment upload Zod schema and CLI/MCP surface with the actual Qonto `POST /v2/attachments` response. Additive (loosens parser) (9af3cb3).
- **`@qontoctl/core`**: align `client-invoice` list `status` enum with the Qonto canonical set. Strict-enum schemas now accept the full set of values the API may return (#544).
- **`@qontoctl/mcp`**: wrap `intl_beneficiary_add` / `intl_beneficiary_update` / `intl_beneficiary_remove` in `executeWithMcpSca` so these write paths participate in the unified SCA-pending → continuation flow (#552).
- **`@qontoctl/mcp`**: wrap `account_create` / `account_update` / `account_close` in `executeWithMcpSca` so bank-account write paths participate in the unified SCA-pending → continuation flow (#553).
- **`@qontoctl/core`**: `client-invoice` schema now accepts `null` items (the Qonto API was observed to return `null` for some line-item slots) (#575).
- **`@qontoctl/core`**: debug logging of HTTP request headers now happens AFTER per-request additions (SCA preference, staging-token, etc.) so the logged headers reflect what's actually sent (#576).

### Security

- **`@qontoctl/core`**: SCA session token redacted from error messages and debug logs. `QontoScaRequiredError`, `ScaTimeoutError`, and `ScaDeniedError` no longer embed the token in their `.message` strings (token remains accessible via the dedicated `.scaSessionToken` field). The `sca_session_token` request-body field and `X-Qonto-Sca-Session-Token` header are added to `redactSensitiveFields` (#430).

### Migration from v1.x

This release introduces the following breaking changes. Each section below lists who is affected and the migration path.

#### 1. Configuration-file resolution: CWD auto-discovery removed (#479)

**Affected**: Users who relied on QontoCtl picking up `./.qontoctl.yaml` from the current working directory (or any parent directory).

**What changed**: The resolver no longer walks up from CWD. The new precedence chain is (highest first):

1. `--config <path>` (CLI only)
2. `QONTOCTL_CONFIG_FILE` env var (CLI **and** MCP)
3. `~/.qontoctl/{profile}.yaml` (when `--profile <name>` is passed)
4. `~/.qontoctl.yaml` (home default)

**Migration paths** (pick one):

- **Direnv shim** (recommended for repo-local configs): copy `.envrc.example` → `.envrc` in your repo (gitignored), then `direnv allow`. This exports `QONTOCTL_CONFIG_FILE="$PWD/.qontoctl.yaml"` automatically when you `cd` into the repo.
- **Per-shell export**: `export QONTOCTL_CONFIG_FILE="$PWD/.qontoctl.yaml"` in your shell profile or before invoking `qontoctl`.
- **Per-invocation flag**: `qontoctl --config ./.qontoctl.yaml ...` on every call.
- **Move credentials**: copy `./.qontoctl.yaml` to `~/.qontoctl.yaml` (or a named profile at `~/.qontoctl/{profile}.yaml` and call with `--profile {name}`).

The MCP server (`qontoctl mcp` or the standalone `@qontoctl/mcp` binary) has no CLI flags, so `QONTOCTL_CONFIG_FILE` is its only mechanism for pointing at a non-default file. Set the env var in your MCP client configuration (e.g. `mcpServers.qontoctl.env.QONTOCTL_CONFIG_FILE` in Claude Desktop's `claude_desktop_config.json`).

See [`docs/configuration.md`](docs/configuration.md) for the full reference.

#### 2. Bank-account update HTTP method: PUT → PATCH (#563)

**Affected**: Direct HTTP consumers of `PUT /v2/bank_accounts/{id}`. Users going through `@qontoctl/core` / `@qontoctl/cli` / `@qontoctl/mcp` are migrated transparently.

**What changed**: `updateBankAccount` (core service), `account update` (CLI), and `account_update` (MCP tool) now send `PATCH` instead of `PUT`. The Qonto API's canonical method for partial bank-account updates is `PATCH`; the previous `PUT` worked only because the sandbox happened to accept it.

**Migration**: direct API consumers must change their request method from `PUT` to `PATCH`. No request-body or response-shape changes.

#### 3. OAuth env-overlay scope: `QONTOCTL_REFRESH_TOKEN` no longer read (#495)

**Affected**: CI / scripted setups relying on the `QONTOCTL_REFRESH_TOKEN` env var. The profile-prefixed `QONTOCTL_{PROFILE}_REFRESH_TOKEN` is also no longer read.

**What changed**: Refresh tokens rotate on every refresh. The env-overlay would have shadowed the rotation on subsequent reads, defeating persistence — so the env var was effectively broken before; it now fails closed rather than silently misbehaving. `QONTOCTL_ACCESS_TOKEN` is **kept** with read-only / discard-after-use semantics (mirrors `AWS_SESSION_TOKEN`).

**Migration paths**:

- Use file-based OAuth credentials at `~/.qontoctl.yaml` or `~/.qontoctl/{profile}.yaml`.
- For CI scenarios where file persistence isn't viable, use API-key env vars (`QONTOCTL_ORGANIZATION_SLUG` + `QONTOCTL_SECRET_KEY`) — note that api-key auth doesn't cover all endpoints (cards, teams, webhooks, e-invoicing, etc., are OAuth-only per the [Qonto auth table](https://docs.qonto.com/get-started/business-api/authentication/introduction)).
- For one-shot scripted invocations against an already-valid bearer, use `QONTOCTL_ACCESS_TOKEN`.

#### 4. MCP SCA-required (HTTP 428) response shape (#428)

**Affected**: MCP clients (Claude Desktop, Cursor, etc.) that parse the previous text-only response from the eight MCP write-tool families: `transfer_*`, `intl_transfer_*`, `internal_transfer_*`, `bulk_transfer_*`, `recurring_transfer_*`, `card_*`, `beneficiary_*`, `request_*`.

**What changed**: When the Qonto API returns HTTP 428 (SCA required), the MCP tools now return a structured **SCA-pending response** referencing `sca_session_show` and `sca_session_mock_decision` (sandbox), plus accept optional `wait` (number 0–120, or `false`) and `sca_session_token` input parameters for bounded polling and two-step continuation.

**Migration**: MCP-tool callers that parsed the previous dead-end text response must adapt to the new shape. The new flow is:

1. First call → returns either the success body OR an SCA-pending response with `sca_session_token`.
2. (Optional) Inspect via `sca_session_show <token>`.
3. (Sandbox) Approve via `sca_session_mock_decision <token> allow`. (Production) The user completes SCA on their paired device.
4. Re-call the original tool with `sca_session_token` set to the token from step 1 to retrieve the completed result.

See [`docs/security/sca-token-binding.md`](docs/security/sca-token-binding.md) for the PSD2 Article 5 dynamic-linking properties this flow preserves.

#### 5. Bulk-transfer request shape: flat, with required per-item `client_transfer_id` (#487)

**Affected**: Direct callers of `@qontoctl/core` `createBulkTransfer`; CLI/MCP users supplying JSON input files for `bulk-transfer create`.

**What changed**: Request body is now `{ bank_account_id, bulk_transfers, vop_proof_token }` (flat, no `bulk_transfer:` envelope). Per-item changes: `client_transfer_id` (UUID) is now **required** (auto-generated by CLI/MCP when omitted); `amount` is a decimal string; `reference` required; the previous `currency` per-item field is removed (currency is dictated by the source bank account).

**Migration**: regenerate the request body per the new shape. CLI gains required `--debit-account <id>` and optional `--vop-proof-token <token>` (auto-resolved via `bulk_verify_payee` when omitted). MCP `bulk_transfer_create` schema gains `bank_account_id` and `vop_proof_token` (auto-resolved when omitted, except on SCA retry per PSD2 dynamic linking).

#### 6. Recurring-transfer request shape: `amount` as string, `vop_proof_token` required (#486)

**Affected**: Direct callers of `@qontoctl/core` `createRecurringTransfer`. CLI/MCP users are migrated transparently.

**What changed**:

- `CreateRecurringTransferParams.amount` is now `string` (was `number`). The Qonto API rejects numeric amounts with `not_a_string: amount must be a string`.
- `CreateRecurringTransferParams.vop_proof_token` is now a required `string` field at the top level of the request body (alongside the `recurring_transfer` envelope). The Qonto API rejects requests missing the token with `401 vop_proof_token_missing`.

**Migration**: convert `amount` with `String(amount)` or `amount.toFixed(2)`; supply `vop_proof_token` from `verifyPayee` against the beneficiary's IBAN/name. CLI/MCP wrappers auto-resolve when omitted, except on SCA retry where PSD2 RTS Art. 5 dynamic linking requires the caller to supply the original token.

## [1.0.0] — 2026-03-26

### Added

- OAuth 2.0 authentication flow with PKCE, token management, and automatic refresh
- SCA (Strong Customer Authentication) handling infrastructure for write operations
- Idempotency key management for write operations
- OAuth app setup guide (`docs/oauth-setup.md`)
- Account management commands: `account create`, `account update`, `account close`, `account iban-certificate`
- SEPA beneficiary commands: `beneficiary list`, `beneficiary show`, `beneficiary add`, `beneficiary update`, `beneficiary trust`, `beneficiary untrust`
- SEPA transfer commands: `transfer list`, `transfer show`, `transfer create`, `transfer cancel`, `transfer proof`, `transfer verify-payee`, `transfer bulk-verify-payee`
- Internal transfer command: `internal-transfer create`
- Bulk transfer commands: `bulk-transfer list`, `bulk-transfer show`, `bulk-transfer create`
- Recurring transfer commands: `recurring-transfer list`, `recurring-transfer show`
- Client management commands: `client list`, `client show`, `client create`, `client update`, `client delete`
- Client invoice commands: `client-invoice list`, `client-invoice show`, `client-invoice create`, `client-invoice update`, `client-invoice delete`, `client-invoice finalize`, `client-invoice send`, `client-invoice mark-paid`, `client-invoice unmark-paid`, `client-invoice cancel`, `client-invoice upload`, `client-invoice upload-show`
- Quote commands: `quote list`, `quote show`, `quote create`, `quote update`, `quote delete`, `quote send`
- Credit note commands: `credit-note list`, `credit-note show`
- Supplier invoice commands: `supplier-invoice list`, `supplier-invoice show`, `supplier-invoice bulk-create`
- E-invoicing command: `einvoicing settings`
- Request command: `request list`
- Attachment commands: `attachment upload`, `attachment show`
- Transaction attachment commands: `transaction attachment list`, `transaction attachment add`, `transaction attachment remove`
- Membership management commands: `membership show`, `membership invite`
- Corresponding MCP tools for all new CLI commands (69 tools total)
- MCP registry configuration files
- Social preview banner for README

## [0.1.0] — 2026-02-27

### Added

- Organization and bank accounts commands (`org show`, `account list`, `account show`)
- Transaction commands with filtering and pagination (`transaction list`, `transaction show`)
    - Filter by bank account, status, side, operation type, date range, and attachments
    - Customizable sort order and nested resource inclusion (labels, attachments, vat_details)
    - Auto-resolve to main bank account when no account specified
- Bank statement commands (`statement list`, `statement show`, `statement download`)
- Labels management commands (`label list`, `label show`)
- Membership listing command (`membership list`)
- Profile management for multi-organization support (`profile add`, `profile list`, `profile show`, `profile remove`, `profile test`)
    - Named profiles stored in `~/.qontoctl/` with restrictive file permissions
    - Configuration resolution from environment variables, CWD file, named profiles, and home directory
- Shell completion generation for bash, zsh, and fish
- Four output formats: table (default), json, yaml, csv
- Global CLI error handler with user-friendly error messages
- Debug mode with sensitive field redaction in logs
- Full API field output for json/yaml formats in label and membership commands
- MCP server with stdio transport and 10 tools:
  `org_show`, `account_list`, `account_show`, `transaction_list`, `transaction_show`,
  `statement_list`, `statement_show`, `label_list`, `label_show`, `membership_list`
- Standalone MCP server entry point (`qontoctl mcp`)
- HTTP client foundation with typed error handling
- API key authentication module
- URL parameter encoding for all API path parameters
- Comprehensive test suites: unit tests with coverage thresholds, E2E tests for CLI and MCP
- Strict TypeScript configuration with `strictTypeChecked` ESLint rules
- README for each publishable package
- MCP integration guide and tool documentation
- AGPL license FAQ in project README
- PR template and Code of Conduct

### Fixed

- Restrictive file permissions on credential configuration files
- `@types/node` version aligned with Node.js runtime requirement
- MCP standalone entry point uses resolved endpoint configuration
- Topological publish order in release workflow
- Unsafe type assertions removed from HTTP client
- Dead MCP tool files removed; `withClient` error handling added
- Test files excluded from published dist/ builds
- LICENSE file included in all published npm packages
- `publishConfig` added to scoped package.json files

### Changed

- Replaced `--sandbox` flag with endpoint/sandbox configuration
- Replaced `eslint-plugin-header` with maintained fork
- Version read from `package.json` at runtime instead of hardcoded

## [0.0.0] — 2026-02-26

### Added

- Monorepo scaffolding with pnpm workspace and Turbo build orchestration
- `@qontoctl/core` package for Qonto API client and service layer
- `@qontoctl/mcp` package with MCP server (stdio transport)
- `@qontoctl/cli` package with CLI command definitions
- CI pipeline (GitHub Actions) with multi-platform testing
- Release pipeline with npm provenance attestation
- SPDX license headers on all source files
- ESLint rule to enforce SPDX license headers on new files
- Dependency license compatibility check in CI
- CODEOWNERS for security-sensitive files
- Issue templates for bug reports and feature requests
- Dependabot configuration for automated dependency updates
- CONTRIBUTING guide with development setup instructions
- Security documentation for credential handling and MCP trust model
