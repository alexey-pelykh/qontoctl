# Qonto Sandbox Preconditions

The Qonto sandbox (and, for some endpoints, production with a fresh test
organization) enforces preconditions that are not surfaced in the public Qonto
OpenAPI reference. When a test exercises a write endpoint without first
satisfying its precondition, the server returns a 4xx/5xx with an error key
that contributors otherwise rediscover as "flake".

This catalog is the L3 layer of the [E2E test reliability
design](./designs/e2e-test-reliability.md) (epic [#603], sub-issue [#606]). It
exists so that:

- Every write endpoint with a known precondition is documented once, with the
  failure signature and the remediation path.
- Every E2E test that depends on a non-trivial precondition links back to its
  catalog entry inline, so the next contributor reads the precondition before
  re-deriving it from the server's error response.
- Sandbox-blocker issues that were previously tracked as ad-hoc follow-ups
  (#539, #561, #567, #570) are absorbed here — they become catalog entries
  rather than scattered issues.

## Scope

- **In**: write endpoints (POST / PUT / PATCH / DELETE) where the Qonto
  sandbox enforces a precondition that is not validated client-side. Examples:
  HTTP 412 `quote_has_no_attachment` on `PATCH /v2/quotes/{id}`, HTTP 422
  `invalid_iban` on `POST /v2/client_invoices` when the org lacks an invoicing
  IBAN, HTTP 403 on `PUT /v2/cards/{id}/options` despite all card-write scopes.
- **Out**: feature gating (the org's sandbox plan does not enable the feature
  at all — covered by the `feature-not-supported` skip taxonomy in
  `packages/e2e/src/helpers.ts`, not by this catalog).

For the design decision behind this document-only approach (vs runtime
probe-before-call), see [Solution Design §7.3 Q2
resolution](./designs/e2e-test-reliability.md).

## Entry schema

Each section is one write endpoint, identified by HTTP method plus URL
template. The entry carries four fields:

- **Precondition** — the resource state that must hold before the call
  succeeds, in plain English.
- **Failure signature** — the HTTP status code plus the error key the sandbox
  returns when the precondition is not met. Tests use this to triage a
  failure as "expected sandbox state" rather than "production bug".
- **Remediation in tests** — what the test should do: satisfy the
  precondition first, OR skip with a `sandbox-precondition` reason via
  `skipIfToolError(...)` (visible skip, [see
  `helpers.ts`](../packages/e2e/src/helpers.ts)).
- **Discovered** — the issue or commit that surfaced the precondition, plus
  the empirical-probe date when applicable. Date is the most recent
  re-verification; entries flip status over time as Qonto evolves the
  sandbox.

## Convention: linking from tests

Tests that depend on a precondition documented here MUST carry an inline
comment of the form:

```ts
// precondition: docs/qonto-sandbox-preconditions.md#patch-v2-quotes-id
```

so a reader of the test can resolve the precondition without re-reading the
sandbox's error response. Anchor IDs are derived mechanically from
`{method}-{path}` (lowercase, slashes and special chars replaced with `-`,
`{id}` placeholders collapse to `-id`).

## Catalog

Grouped by Qonto API domain. Each anchor is stable across editorial passes;
treat the anchor ID as a contract that tests link to.

### Quotes

#### `PATCH /v2/quotes/{id}` {#patch-v2-quotes-id}

**Precondition**: The quote must have at least one attachment before PATCH.
A freshly-created quote (`POST /v2/quotes`) starts with zero attachments,
so the immediate PATCH that the CRUD lifecycle test attempts is rejected.

**Failure signature**: HTTP 412, error key `quote_has_no_attachment`.

**Remediation in tests**: Two options, per [Solution Design §7.2 R-SP-3]:

- _Path A (preferred)_: Upload + attach an attachment via the quote's
  attachment endpoint before calling `quote_update`. The 412 disappears
  and the CRUD lifecycle exercises the real update path.
- _Path B (fallback)_: Skip the update step with
  `skipIfToolError(result, ctx, "sandbox-precondition", "quote_update requires
attachment — see #606 (design §7.2)")`. The lifecycle's downstream delete
  step still runs.

The current `packages/e2e/src/quotes/mcp.e2e.test.ts` lifecycle takes Path B
pending the [#607] follow-up that will implement Path A.

**Discovered**: [#496] (originally surfaced as order-dependent flake);
diagnosed during [#602] / [#603] root-cause analysis (2026-05-17).

#### `POST /v2/quotes/{id}/send` {#post-v2-quotes-id-send}

**Status**: ⚠️ **Stale precondition — no longer applies as of [#638]
(empirical re-probe 2026-05-22).** Kept for historical context per the
Maintenance convention (do not delete sandbox-flip entries).

**Original precondition** (pre-#638): The quote's `client` must have a
non-empty `email` attribute. Quotes whose client lacked an email returned
HTTP 4xx from `quote_send`.

**Empirical update (2026-05-22, [#638])**: The original precondition was
an artefact of the empty-body call shape (the call shape that produced
`invalid_body: EOF` per [#636] arm 1, since the request body was where
recipient emails belonged). With the typed
{@link SendQuoteRequestPayload} payload now required by the contract
(`send_to` array + `email_title`), the API uses `send_to` as the
recipient list and accepts the call regardless of the quote's client
mailbox state. Probe details: a freshly-created `individual` client with
no `email` attribute was bound to a draft quote, and `POST
/v2/quotes/{id}/send` with a valid `send_to` returned 200 — see PR #638
description for the raw transcript.

**Test triage**: As of [#638], the E2E test for `quote_send` asserts
success (`expect(result.isError).toBeFalsy()`); any failure (including a
historical regression to 422/EOF) surfaces as a test failure rather than
a `sandbox-precondition` skip. No precondition skip path remains for
this endpoint.

**Discovered**: [#606] original cataloguing (2026-05-17, based on
empty-body call shape). [#638] empirical re-probe (2026-05-22) confirmed
the precondition no longer applies under the typed-payload call shape.

#### `DELETE /v2/quotes/{id}` {#delete-v2-quotes-id}

**Precondition**: The quote must be in a non-`sent` state. A quote that
has been successfully sent transitions out of the deletable state and the
delete is rejected.

**Failure signature**: HTTP 4xx from `quote_delete` when `quote_send`
succeeded earlier in the same lifecycle.

**Remediation in tests**: When chaining `send` → `delete` in a CRUD
lifecycle, treat the post-send delete as best-effort and skip with
`skipIfToolError(result, ctx, "sandbox-precondition", "quote_delete
requires non-sent state — see #606")`. Sent quotes accumulate in the
sandbox; this is an accepted trade-off pending a sandbox cleanup pass.

**Discovered**: [#606] (catalogued from [#605] L1 sweep, 2026-05-17).

### Client Invoices

#### `POST /v2/client_invoices/{id}/send` {#post-v2-client-invoices-id-send}

**Precondition**: The client invoice must be finalized (`status: unpaid`),
and the recipient address supplied in the `send_to` payload must be a
routable mailbox. The legacy contact-email path (the invoice's embedded
`client.email`) is no longer authoritative: the Qonto OpenAPI contract
takes the recipient list from the request body's `send_to` field, with
`copy_to_self` (default `true`) BCCing the authenticated user. The
sandbox accepts the body shape but rejects when no recipient resolves to
a deliverable address.

**Failure signature**: HTTP 4xx from `client_invoice_send` with an error
mentioning the recipient mailbox / client email. The exact error key
depends on whether the recipient is absent, malformed, or unrouteable;
the E2E test triages on a tight regex over the error text and skips
ONLY on that signature — any other error (including the historical
HTTP 422 `invalid_body: EOF` that surfaced before #639 wired the
payload) fails the test as a regression guard.

**Remediation in tests**: The `client_invoice_send` E2E describe block
is opt-in via `QONTOCTL_E2E_SEND_EMAIL=true` (it requires a no-bounce
sandbox mailbox to assert success). When enabled, override the
recipient with `QONTOCTL_E2E_SEND_EMAIL_TO=<address>` if the default
`e2e-test-639@example.com` is not routable in your sandbox. The
sharpened triage is implemented in
`packages/e2e/src/client-invoices/{cli,mcp}.e2e.test.ts` —
sandbox-precondition matches skip with the
`sandbox-precondition: client_invoice_send requires a routable
recipient mailbox` reason; anything else (including the regression
shape) fails. See [#638](https://github.com/alexey-pelykh/qontoctl/issues/638) for the parallel
quote-side fix using the same triage pattern.

**Discovered**: Parallel-bug class to #636 arm 1
(`quote_send` HTTP 422/EOF), surfaced during the #636 investigation
and fixed in #639.

#### `POST /v2/client_invoices` {#post-v2-client-invoices}

**Precondition**: The organization must have an _invoicing IBAN_
configured. This is distinct from the bank-account IBANs returned by
`GET /v2/organization` (which may be present) and is also distinct from
`einvoicing.sending_status` returned by `GET /v2/einvoicing/settings`
(that field gates e-invoicing distribution, not invoice creation). The
invoicing-IBAN setting is not exposed by the public Qonto API — it must
be configured via the Qonto web UI or a Qonto support ticket.

**Failure signature**: HTTP 422, error key `invalid_iban`, detail
`IBAN is empty`. The error is misleading; the org has bank-account IBANs
but `client-invoice create` requires the separate org-level invoicing
IBAN.

**Remediation in tests**: Currently triaged as
`feature-not-supported` in `packages/e2e/src/client-invoices/{cli,mcp}.e2e.test.ts`
(the entire write-path lifecycle is unreachable without the configuration,
so it behaves like a missing feature from the test's perspective). The
investigation track is [#539]; if the precondition is satisfied on a future
test org, the triage should narrow to `sandbox-precondition`.

**Discovered**: Empirically probed 2026-05-11 across sandbox + production
test orgs (see [#539] probe matrix). Catalogued by [#606].

### SEPA Beneficiaries

#### `PUT /v2/sepa/beneficiaries/{id}` {#put-v2-sepa-beneficiaries-id}

**Precondition**: The beneficiary must be in `status: validated`. SEPA
beneficiaries created via `POST /v2/sepa/beneficiaries` land in
`status: pending` and require manual validation in the Qonto web UI
before they accept PUT updates.

**Failure signature**: HTTP 404. Returned for `pending` records as if the
beneficiary did not exist, rather than a clearer 409/422.

**Remediation in tests**: The SCA-write-path tests in
`packages/e2e/src/beneficiaries/{cli,mcp}.e2e.test.ts` filter the
`beneficiary list` to `status: validated` server-side in their
`beforeAll` and throw with a precondition-unmet message when zero
validated beneficiaries exist. Manually validate one beneficiary in the
Qonto sandbox UI to unblock the suite, or wait for the SCA-trigger
validation path on `beneficiary_add` to mature so freshly-created records
land in `validated`.

**Discovered**: [#551], [#559] (2026-05-12 probe).

### International Beneficiaries

#### `POST /v2/international/beneficiaries` {#post-v2-international-beneficiaries}

**Precondition**: Unknown — every probed payload variant returns the same
generic 500. Likely causes: sandbox partner-onboarding configuration, a
specific staging-org capability flag, or a transient sandbox defect.

**Failure signature**: HTTP 500, body `{"errors":[{"code":"unknown",
"detail":"Unknown error"}]}`. Probed corridors (US/USD, GB/GBP, DE/EUR,
CH/CHF, JP/JPY) and field shapes (name-only, ACH-shape, UK-shape,
no-fields) all return the same response (2026-05-12).

**Remediation in tests**: No remediation available on the test side.
`packages/e2e/src/intl-beneficiaries/{cli,mcp}.e2e.test.ts` does not
exercise the write paths; the deferred coverage is tracked under [#561].
The CLI / MCP code paths are confirmed structurally correct by
audit-refresh inspection — the issue is sandbox-side.

**Discovered**: [#552] discovery, [#561] tracking (2026-05-12).

#### `PUT /v2/international/beneficiaries/{id}` {#put-v2-international-beneficiaries-id}

**Precondition**: Requires a successfully-created international
beneficiary; blocked by [`POST /v2/international/beneficiaries`](#post-v2-international-beneficiaries).

**Failure signature**: Cannot be reached — the create endpoint blocks
exercise of update.

**Remediation in tests**: Deferred until the create blocker resolves.
Tracked under [#561].

**Discovered**: [#561] (2026-05-12).

#### `DELETE /v2/international/beneficiaries/{id}` {#delete-v2-international-beneficiaries-id}

**Precondition**: Requires a successfully-created international
beneficiary; blocked by [`POST /v2/international/beneficiaries`](#post-v2-international-beneficiaries).

**Failure signature**: Cannot be reached — the create endpoint blocks
exercise of remove.

**Remediation in tests**: Deferred until the create blocker resolves.
Tracked under [#561].

**Discovered**: [#561] (2026-05-12).

### Cards

#### `POST /v2/cards/bulk` {#post-v2-cards-bulk}

**Precondition**: The sandbox-plan tier must enable bulk card creation.
All standard `card.write` scopes (`cards.write`, `cards.update`,
`cards.delete`) on the OAuth token are insufficient — single-card
`POST /v2/cards` works against the same token in the same test run, so
the issue is plan/role gating, not auth misconfiguration.

**Failure signature**: HTTP 404 `not_found`.

**Remediation in tests**: No client-side remediation; the endpoint is
unavailable to the standard sandbox plan. Coverage deferred under [#570].
`packages/e2e/src/cards/{cli,mcp}.e2e.test.ts` documents this in its
header empirical-probe table and at the bottom-of-file deferral note.

**Discovered**: [#556] original probe (2026-04), re-confirmed [#570]
re-probe (2026-05-12).

#### `PUT /v2/cards/{id}/options` {#put-v2-cards-id-options}

**Precondition**: The sandbox-plan tier must enable card-options updates.
Same sandbox-plan / admin-role pattern as `POST /v2/cards/bulk` — all
`card.write` scopes are granted but the endpoint rejects.

**Failure signature**: HTTP 403 Forbidden.

**Remediation in tests**: No client-side remediation. Coverage deferred
under [#570]. Same documentation surface as `POST /v2/cards/bulk` — see
the header empirical-probe table in `packages/e2e/src/cards/cli.e2e.test.ts`.

Note: `PUT /v2/cards/{id}/restrictions` was originally listed alongside
this endpoint as part of [#570] but flipped from 403 → 200 between the
2026-04 [#556] probe and the 2026-05-12 [#570] re-probe without any
user-visible config change — likely a sandbox-plan tier upgrade by Qonto.
It is now covered as round-trip #6 in the cards CLI lifecycle test.

**Discovered**: [#556] original probe (2026-04), re-confirmed [#570]
re-probe (2026-05-12).

### Requests

#### `POST /v2/requests/flash_cards` {#post-v2-requests-flash-cards}

**Precondition**: The sandbox-plan or admin-role gating must enable
flash-card request creation. All `request_*.write` scopes
(`request_review.write`, `request_cards.write`,
`request_transfers.write`) on the OAuth token are insufficient —
`POST /v2/requests/multi_transfers` works on the same token in the same
test run, so a single `request.write` scope sub-feature is gated.

**Failure signature**: HTTP 403 Forbidden, body
`{"errors":[{"code":"unknown","detail":"Unknown error"}]}`.

**Remediation in tests**: No client-side remediation. Coverage deferred
under [#567]. `packages/e2e/src/requests/{cli,mcp}.e2e.test.ts` documents
this in its header empirical-probe block and at the bottom-of-file
deferral note. The covered multi-transfer create exercises the one
working write path against the sandbox.

**Discovered**: [#555] (deferred to [#567], 2026-05-12).

#### `POST /v2/requests/virtual_cards` {#post-v2-requests-virtual-cards}

**Precondition**: Same sandbox-plan / admin-role gating as
[`POST /v2/requests/flash_cards`](#post-v2-requests-flash-cards).

**Failure signature**: HTTP 403 Forbidden, body
`{"errors":[{"code":"unknown","detail":"Unknown error"}]}`.

**Remediation in tests**: No client-side remediation. Coverage deferred
under [#567].

**Discovered**: [#555] (deferred to [#567], 2026-05-12).

#### `POST /v2/requests/multi_transfers/{id}/approve` {#post-v2-requests-multi-transfers-id-approve}

**Precondition**: Same sandbox-plan / admin-role gating as
[`POST /v2/requests/flash_cards`](#post-v2-requests-flash-cards).
Additionally requires a pre-existing pending multi-transfer request to
target — the create-multi-transfer path that produces these works fine
in the sandbox.

**Failure signature**: HTTP 403 Forbidden, body
`{"errors":[{"code":"unknown","detail":"Unknown error"}]}`. The 403
fires before any approver-permission check has a chance to validate the
request body, so the gating is on the endpoint not the payload.

**Remediation in tests**: No client-side remediation. Coverage deferred
under [#567].

**Discovered**: [#555] (deferred to [#567], 2026-05-12).

#### `POST /v2/requests/multi_transfers/{id}/decline` {#post-v2-requests-multi-transfers-id-decline}

**Precondition**: Same sandbox-plan / admin-role gating as
[`POST /v2/requests/multi_transfers/{id}/approve`](#post-v2-requests-multi-transfers-id-approve).

**Failure signature**: HTTP 403 Forbidden, body
`{"errors":[{"code":"unknown","detail":"Unknown error"}]}`.

**Remediation in tests**: No client-side remediation. Coverage deferred
under [#567].

**Discovered**: [#555] (deferred to [#567], 2026-05-12).

## Absorbed L3-blocker issues

These issues tracked individual sandbox blockers before this catalog
existed. They remain open as the investigation tracks for unblocking the
underlying sandbox state (or accepting it as a permanent gap), but the
_documentation_ of each blocker now lives here.

| Issue  | Endpoints absorbed                                                                                                             | Catalog anchors                                                                                                                                                                                      |
| ------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#539] | `POST /v2/client_invoices` (invoicing-IBAN config)                                                                             | [post-v2-client-invoices](#post-v2-client-invoices)                                                                                                                                                  |
| [#561] | `POST/PUT/DELETE /v2/international/beneficiaries` (sandbox 500)                                                                | [post](#post-v2-international-beneficiaries), [put](#put-v2-international-beneficiaries-id), [delete](#delete-v2-international-beneficiaries-id)                                                     |
| [#567] | `POST /v2/requests/{flash_cards,virtual_cards}`, `POST /v2/requests/multi_transfers/{id}/{approve,decline}` (sandbox-plan 403) | [flash](#post-v2-requests-flash-cards), [virtual](#post-v2-requests-virtual-cards), [approve](#post-v2-requests-multi-transfers-id-approve), [decline](#post-v2-requests-multi-transfers-id-decline) |
| [#570] | `POST /v2/cards/bulk`, `PUT /v2/cards/{id}/options` (sandbox-plan 404/403)                                                     | [bulk](#post-v2-cards-bulk), [options](#put-v2-cards-id-options)                                                                                                                                     |

## Maintenance

- **New entries**: when a contributor surfaces a new sandbox precondition,
  the doc update and the test inline-link MUST land in the same PR (per
  [#606] AC #4). The "doc + test link in one PR" convention is the
  preventative against doc drift.
- **Sandbox flips**: when Qonto changes a precondition (e.g., the
  `PUT /v2/cards/{id}/restrictions` 403 → 200 flip on 2026-05-12 noted
  above), update the affected entry in place and amend the `Discovered`
  line with the re-probe date. Do not delete entries that no longer apply
  — they are useful as historical context for future regressions.
- **Anchor stability**: anchor IDs are part of the API surface that tests
  rely on. Treat them as breaking-change-prone — rename only when an
  endpoint URL itself changes upstream.

[#496]: https://github.com/alexey-pelykh/qontoctl/issues/496
[#539]: https://github.com/alexey-pelykh/qontoctl/issues/539
[#551]: https://github.com/alexey-pelykh/qontoctl/issues/551
[#552]: https://github.com/alexey-pelykh/qontoctl/issues/552
[#555]: https://github.com/alexey-pelykh/qontoctl/issues/555
[#556]: https://github.com/alexey-pelykh/qontoctl/issues/556
[#559]: https://github.com/alexey-pelykh/qontoctl/issues/559
[#561]: https://github.com/alexey-pelykh/qontoctl/issues/561
[#567]: https://github.com/alexey-pelykh/qontoctl/issues/567
[#570]: https://github.com/alexey-pelykh/qontoctl/issues/570
[#602]: https://github.com/alexey-pelykh/qontoctl/pull/602
[#603]: https://github.com/alexey-pelykh/qontoctl/issues/603
[#605]: https://github.com/alexey-pelykh/qontoctl/issues/605
[#606]: https://github.com/alexey-pelykh/qontoctl/issues/606
[#607]: https://github.com/alexey-pelykh/qontoctl/issues/607
[#636]: https://github.com/alexey-pelykh/qontoctl/issues/636
[#638]: https://github.com/alexey-pelykh/qontoctl/issues/638
[Solution Design §7.2 R-SP-3]: ./designs/e2e-test-reliability.md
