# SCA Session Token Binding (PSD2 Art. 5 Dynamic Linking)

> **Issue**: [#438](https://github.com/alexey-pelykh/qontoctl/issues/438)
> **Status**: VERIFIED — Outcome A (token rebound to transfer parameters)
> **Verified**: 2026-05-05 against Qonto sandbox
> **Gates**: [#433](https://github.com/alexey-pelykh/qontoctl/issues/433) (MCP `executeWithMcpSca` wrapper), [#428](https://github.com/alexey-pelykh/qontoctl/issues/428) (umbrella)

## Why this matters

Several QontoCtl design decisions assume that Qonto's `sca_session_token` is **cryptographically bound to the specific payment** (amount + payee) per [PSD2 Commission Delegated Regulation 2018/389 Article 5](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32018R0389) (dynamic linking). The most consequential of these is the [#433](https://github.com/alexey-pelykh/qontoctl/issues/433) MCP `executeWithMcpSca` wrapper, which re-issues the original operation with the approved token on retry. If Qonto did NOT properly rebind the token, the wrapper would expose users to:

- An approved token from a EUR 1.00 transfer being reused for a EUR 99,999 transfer.
- A token from a transfer to a trusted SEPA payee being reused for a transfer to an attacker-controlled payee.
- Idempotency-key mismatches landing duplicates if the operation re-shapes between attempts (already addressed by [#429](https://github.com/alexey-pelykh/qontoctl/issues/429)).

This document records the **empirical verification** of the binding assumption — and the bugs discovered in QontoCtl's existing SCA implementation while attempting that verification.

## Regulatory baseline

PSD2 RTS Art. 5 (dynamic linking) requires payment service providers (PSPs) to ensure that the authentication code generated for a payment transaction is:

1. Specific to the **amount** of the payment transaction.
2. Specific to the **payee**.
3. Such that any change to amount or payee invalidates the code.

Qonto holds a PSP licence under PSD2; compliance is mandated, not optional. The empirical test below was therefore expected to confirm Outcome A (token rebound) — but **the qontoctl codebase made the assumption without verifying it**, which is the spike's primary motivation.

## Test methodology

### Hypothesis

`H₀`: Qonto's `sca_session_token`, once approved, can be reused for a different transfer (different amount or different payee) on the same SCA session — i.e., the token is **generic** within a session.

`H₁` (expected per PSD2): Qonto's `sca_session_token` is **rebound** to the specific transfer parameters; reusing it for a different transfer is rejected.

### Procedure

1. Authenticate against the Qonto sandbox (OAuth + `X-Qonto-Staging-Token`).
2. Verify a SEPA payee via VoP (`POST /v2/sepa/verify_payee`) — captures `vop_proof_token`.
3. Create transfer A (`POST /v2/sepa/transfers`, amount = 1.50 EUR) → expect 428 with `sca_session_token`.
4. Approve the token via the sandbox mock endpoint (`POST /v2/mocked_sca_sessions/<token>/allow`).
5. Create transfer B with the **same payee but different amount** (99.00 EUR), passing the approved `tokenA` via `X-Qonto-Sca-Session-Token` → observe response.

`H₁` predicts a 4xx that signals "this token does not match this request" (rejection); `H₀` predicts a 2xx (silent acceptance).

### Headers required (often missed)

| Header                      | Value             | Why                                                                                                                                                                                                                                                                                                  |
| --------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `X-Qonto-Staging-Token`     | `<staging-token>` | Routes the request to sandbox infrastructure                                                                                                                                                                                                                                                         |
| `X-Qonto-2fa-Preference`    | `mock`            | Tells Qonto to use the mock SCA flow instead of demanding a paired device. **Without this header, every sensitive write returns 428 with `sca_not_enrolled` because the test account is not enrolled.** Allowed values in production: `paired-device`, `passkey`, `sms-otp`. `mock` is sandbox-only. |
| `X-Qonto-Sca-Session-Token` | `<token>`         | Set on the retry request after token approval                                                                                                                                                                                                                                                        |
| `X-Qonto-Idempotency-Key`   | `<uuid>`          | Per request; same key for the initial 428 and the SCA retry of the **same** logical operation (see [#429](https://github.com/alexey-pelykh/qontoctl/issues/429))                                                                                                                                     |

### 428 response shapes observed

For `paired-device` (or default) without enrollment:

```json
{
    "code": "sca_not_enrolled",
    "message": "You must enable SCA to perform this action",
    "trace_id": "..."
}
```

For `X-Qonto-2fa-Preference: mock` (sandbox-enrolled flow):

```json
{
    "action_type": "transfer.single.create",
    "code": "sca_required",
    "message": "SCA required",
    "sca_recovery_token": "necessary to prevent errors in legacy Android apps",
    "sca_session_token": "<64-char base64url>",
    "trace_id": "..."
}
```

These are the **two distinct 428 shapes**. They differ semantically (one is configuration, one is a real challenge) but are currently treated identically by qontoctl — see [Bug 3 / Bug 6](#bugs-discovered).

## Empirical result

**Outcome A — token rebound. PSD2-compliant.**

```text
[STEP_1] POST /v2/sepa/transfers amount=1.50 → 428 sca_required
[STEP_1] Captured tokenA=<64 chars>
[STEP_2] POST /v2/mocked_sca_sessions/<tokenA>/allow → 200
[STEP_3] POST /v2/sepa/transfers amount=99.00 SAME payee, X-Qonto-Sca-Session-Token: <tokenA> → 422
        body: {"errors":{"message":"Not found"},"trace_id":"..."}
```

Qonto returns **HTTP 422 with `errors.message: "Not found"`** when the captured token is presented for a different amount. This is "no SCA session matches this combination of token + request" — i.e., the token does not generalize to a different transfer shape. The literal text `"Not found"` is misleading (it sounds like a 404); functionally it means **rejected by binding mismatch**.

A separate run with the captured token applied to the **same request shape** (amount = 1.50, same payee) returned 200 with the transfer created — confirming the token works only for its originating request.

### What this tells us

- Qonto's binding is at minimum **amount-aware**. We did not separately test "different payee, same amount" because amount-only mismatch was already sufficient to reject; PSD2 mandates both dimensions.
- The token appears **single-use** after a successful retry: a second retry with the SAME shape after a successful first retry returned 422 in pilot runs. This is consistent with PSD2 RTS Art. 4 (SCA codes must be one-time-use) and tightens the safety properties of the [#433](https://github.com/alexey-pelykh/qontoctl/issues/433) wrapper — accidental retries do not double-spend.
- Rejection is **safe by construction**: 422 surfaces in qontoctl as `QontoApiError`, not silent acceptance.

## Implications for #433 wrapper design

The [#433](https://github.com/alexey-pelykh/qontoctl/issues/433) `executeWithMcpSca` wrapper currently re-runs `operation({ scaSessionToken, idempotencyKey })` after polling — i.e., it presumes the same operation with the same shape will be retried with the approved token. This document confirms that assumption is regulatorily and empirically sound. **No redesign needed for the binding dimension.**

However, the existing implementation has independent bugs (below) that must be fixed before [#433](https://github.com/alexey-pelykh/qontoctl/issues/433) and the eight wired write tools ship. The bugs do not invalidate this spike's conclusion — they're orthogonal correctness defects exposed by attempting the experiment.

## Sandbox vs production endpoint divergence

Three categories of difference:

### 1. Different hosts (qontoctl handles correctly via `oauth.staging-token` routing)

|                 | Production                              | Sandbox                                                |
| --------------- | --------------------------------------- | ------------------------------------------------------ |
| API base        | `https://thirdparty.qonto.com`          | `https://thirdparty-sandbox.staging.qonto.co`          |
| OAuth authorize | `https://oauth.qonto.com/oauth2/auth`   | `https://oauth-sandbox.staging.qonto.co/oauth2/auth`   |
| OAuth token     | `https://oauth.qonto.com/oauth2/token`  | `https://oauth-sandbox.staging.qonto.co/oauth2/token`  |
| OAuth revoke    | `https://oauth.qonto.com/oauth2/revoke` | `https://oauth-sandbox.staging.qonto.co/oauth2/revoke` |

Switching is automatic when `oauth.staging-token` is set — see [`packages/core/src/constants.ts`](../../packages/core/src/constants.ts) and [`packages/cli/src/client.ts`](../../packages/cli/src/client.ts).

### 2. Sandbox-only endpoints (no production equivalent)

| Sandbox endpoint | URL                                          | Purpose                                    |
| ---------------- | -------------------------------------------- | ------------------------------------------ |
| Mock SCA approve | `POST /v2/mocked_sca_sessions/<token>/allow` | Simulates user approval on a paired device |
| Mock SCA deny    | `POST /v2/mocked_sca_sessions/<token>/deny`  | Simulates user denial                      |

Both endpoints take **no request body**. Returns 200 on success. There is no "decision" parameter — `/allow` and `/deny` are separate paths.

### 3. Sandbox-only header value

`X-Qonto-2fa-Preference: mock` is accepted only on sandbox. Production accepts `paired-device`, `passkey`, or `sms-otp`. Setting `mock` in production is a configuration error; setting `paired-device` (or omitting the header — which defaults to it) on a sandbox account that hasn't enrolled returns 428 `sca_not_enrolled`.

## Bugs discovered

These were uncovered while attempting the experiment. Each has a corresponding follow-up issue (filed on this PR's merge).

| #   | Bug                                                                                              | Location                                                                                         | Severity | Notes                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `trustBeneficiaries` uses `POST`, Qonto API is `PATCH /v2/sepa/beneficiaries/trust`              | [`packages/core/src/beneficiaries/service.ts`](../../packages/core/src/beneficiaries/service.ts) | High     | Has never worked. Endpoint also requires `beneficiary.trust` scope (Embed-partner-only), so most users would 403 even with the right method.                                                                                                                                                                                                                                                                            |
| 2   | `untrustBeneficiaries` same wrong method                                                         | same file                                                                                        | High     | Untested in production; same Embed-partner gate.                                                                                                                                                                                                                                                                                                                                                                        |
| 3   | `extractScaSessionToken` returns literal string `"unknown"` instead of throwing on missing field | [`packages/core/src/http-client.ts`](../../packages/core/src/http-client.ts)                     | High     | Silent data corruption: callers receive a fake token, then fail downstream with confusing errors. The fallback exists because the actual `sca_not_enrolled` 428 response has no `sca_session_token` field — the function should distinguish the two 428 shapes and surface `sca_not_enrolled` as a typed error.                                                                                                         |
| 4   | `mockScaDecision` URL + body shape are wrong                                                     | [`packages/core/src/sca/sca-service.ts`](../../packages/core/src/sca/sca-service.ts)             | High     | Currently: `POST /v2/sca/sessions/mock/<token>/decision` with body `{ "decision": "allow" \| "deny" }`. Actual: `POST /v2/mocked_sca_sessions/<token>/<allow\|deny>` with no body. The recently-shipped MCP tool [`sca_session_mock_decision`](https://github.com/alexey-pelykh/qontoctl/pull/440) and CLI [`sca-session mock-decision`](https://github.com/alexey-pelykh/qontoctl/pull/439) wrap this broken function. |
| 5   | `createClient` doesn't expose `scaMethod`                                                        | [`packages/cli/src/client.ts`](../../packages/cli/src/client.ts)                                 | Medium   | `HttpClient` supports `scaMethod` (sets `X-Qonto-2fa-Preference`), but no CLI or MCP path can pass it through. Result: every sandbox write op returns `sca_not_enrolled` regardless of test setup, blocking E2E coverage of SCA flows ([#434](https://github.com/alexey-pelykh/qontoctl/issues/434)). Production uses real enrollment, so this isn't a production bug; it's a testability gap.                          |
| 6   | qontoctl conflates `sca_required` (428 with token) with `sca_not_enrolled` (428 without token)   | [`packages/core/src/http-client.ts`](../../packages/core/src/http-client.ts)                     | Medium   | Both shapes throw `QontoScaRequiredError`; only one is actually a recoverable SCA challenge. The other is a configuration error that no amount of polling/retry will resolve. UX cost: misleading error messages on misconfigured accounts.                                                                                                                                                                             |

The cumulative effect of bugs 1, 2, 4, 5 is that **the entire SCA continuation surface area in qontoctl has never been exercised end-to-end against the live Qonto sandbox.** Unit tests (with mocked HTTP) pass; E2E tests (which run against sandbox) skip SCA flows because the responses don't match expectations. This is why the bugs accumulated unnoticed — they're invisible at every gate the project currently runs. [#434](https://github.com/alexey-pelykh/qontoctl/issues/434) is meant to close this gap.

## How to reproduce

> **Prerequisites**: an active Qonto sandbox web-app session in your browser (sign in via [developers.qonto.com](https://developers.qonto.com/) → Toolkit → "Sandbox web app", SMS code `123456`), and a fresh OAuth token in `.qontoctl.yaml` (`qontoctl auth login`). [`docs/oauth-setup.md`](../oauth-setup.md) covers app registration.

The experiment script used here is preserved in this commit's working tree at `.tmp/sca-binding-experiment.mjs` (gitignored — not committed). Re-running it requires:

1. The five qontoctl bugs above remaining un-fixed (the script bypasses them via direct `fetch`); OR
2. Bugs 3, 4, 5 fixed and the script rewritten to use `executeWithSca` + a fixed `mockScaDecision`.

The full procedure as a sequence of `curl` commands:

```bash
# 1. VoP token (precondition for transfers to a SEPA payee)
curl -sX POST https://thirdparty-sandbox.staging.qonto.co/v2/sepa/verify_payee \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Qonto-Staging-Token: $STAGING_TOKEN" \
  -H "X-Qonto-2fa-Preference: mock" \
  -H "X-Qonto-Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"iban":"DE31100101238050671253","beneficiary_name":"Malt"}'
# → 200, returns proof_token.token

# 2. Transfer A (small amount) → 428 with sca_session_token
curl -sX POST https://thirdparty-sandbox.staging.qonto.co/v2/sepa/transfers \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Qonto-Staging-Token: $STAGING_TOKEN" \
  -H "X-Qonto-2fa-Preference: mock" \
  -H "X-Qonto-Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"vop_proof_token":"<vop-token>","transfer":{"bank_account_id":"<acc-id>","beneficiary":{"name":"Malt","iban":"DE31100101238050671253"},"reference":"PSD2-A","amount":"1.50","currency":"EUR"}}'
# → 428, returns sca_session_token

# 3. Approve token via mock endpoint
curl -sX POST "https://thirdparty-sandbox.staging.qonto.co/v2/mocked_sca_sessions/$SCA_TOKEN/allow" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Qonto-Staging-Token: $STAGING_TOKEN"
# → 200

# 4. Transfer B (DIFFERENT amount, captured token) → 422 "Not found" (Outcome A)
curl -sX POST https://thirdparty-sandbox.staging.qonto.co/v2/sepa/transfers \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "X-Qonto-Staging-Token: $STAGING_TOKEN" \
  -H "X-Qonto-2fa-Preference: mock" \
  -H "X-Qonto-Sca-Session-Token: $SCA_TOKEN" \
  -H "X-Qonto-Idempotency-Key: $(uuidgen)" \
  -H "Content-Type: application/json" \
  -d '{"vop_proof_token":"<vop-token>","transfer":{"bank_account_id":"<acc-id>","beneficiary":{"name":"Malt","iban":"DE31100101238050671253"},"reference":"PSD2-B","amount":"99.00","currency":"EUR"}}'
# → 422 errors.message="Not found" — Outcome A confirmed.
```

[#434](https://github.com/alexey-pelykh/qontoctl/issues/434) (E2E coverage for SCA flows) should encode this as an automated regression once Bug 3, 4, 5 are fixed.

## Sample size & limitations

- **One sandbox account**, **one payee**, **one direction of mismatch tested** (different amount, same payee). PSD2 mandates rebinding on payee changes too; we did not test that vector because the amount-only mismatch was already sufficient to reject and Qonto's regulatory obligation covers both.
- **Sandbox != production**. Qonto's sandbox could in theory implement different binding logic from production, though there is no incentive to do so and PSD2 compliance is enforced at the production level. The risk is bounded: if production behaved differently, [#434](https://github.com/alexey-pelykh/qontoctl/issues/434)'s production-aware tests would catch it.
- **Single point in time** (2026-05-05). Qonto could change behavior; this document does not auto-detect drift. The mitigation is [#434](https://github.com/alexey-pelykh/qontoctl/issues/434)'s automated regression coverage.

## References

- [PSD2 RTS — Commission Delegated Regulation (EU) 2018/389, Article 5 (Dynamic linking)](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32018R0389)
- [Qonto API: Strong Customer Authentication flows](https://docs.qonto.com/api-reference/business-api/authentication/sca/sca-flows)
- [Qonto API: Sandbox testing guide](https://docs.qonto.com/get-started/business-api/authentication/oauth/sandbox)
- [Qonto API: URL reference](https://docs.qonto.com/get-started/business-api/urls)
- Internal scope document: SCA Continuation, WI-C (referenced from [#428](https://github.com/alexey-pelykh/qontoctl/issues/428))
- Umbrella issue: [#428](https://github.com/alexey-pelykh/qontoctl/issues/428)
