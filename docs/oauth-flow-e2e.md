# OAuth-Flow E2E (Local-Only)

This guide documents the OAuth-flow E2E suite (`packages/e2e/src/auth/oauth-flow.e2e.test.ts`), which exercises `refreshAccessToken` and `revokeToken` (`packages/core/src/auth/oauth-service.ts`) by round-tripping against the real Qonto sandbox OAuth server.

## Why this suite is local-only

Qonto rotates refresh tokens on **every** `oauth/token` exchange (per RFC 6749 §6 rotation discipline) and does not issue long-lived refresh tokens. Any CI run that successfully exercises the suite invalidates the seeded secret, which would require the maintainer to manually re-seed before the next run — unsustainable maintenance burden for a non-blocking informational job.

The OAuth-flow suite therefore runs **locally only**. The same code path ships to users via `refreshAccessToken` / `revokeToken` in `@qontoctl/core`, and the api-key-compatible E2E suites continue to cover the api-key auth surface in CI.

Project policy (per [CLAUDE.md § E2E Testing](../CLAUDE.md)) requires running the full `pnpm test:e2e` suite locally before pushing any E2E-touching PR — that's where this suite is exercised.

A mock-OAuth-server retrofit (record sandbox responses, replay them in CI) was explored in [#591](https://github.com/alexey-pelykh/qontoctl/issues/591) and **declined**: replaying recorded fixtures duplicates the existing CI unit coverage of the OAuth client (`packages/core/src/auth/oauth-service.test.ts` exercises request construction, Zod response parsing, and every HTTP error path against a stubbed `fetch`; `oauth-authorization-factory.test.ts` exercises rotation-handling — adopt / persist / preserve, readOnly mode — against a stubbed `refreshAccessToken`), and a replay mock forfeits the live-sandbox fidelity that is this suite's whole purpose. Mocking the Qonto API in E2E is additionally out of scope per the [e2e-test-reliability PRD](./prds/e2e-test-reliability.md). This suite is local-only **by design**, not pending a retrofit.

## Running locally

The suite requires a **dedicated, disposable** sandbox refresh token in the `QONTOCTL_E2E_OAUTH_REFRESH_TOKEN_LONG` env var. It **rotates and revokes** the token it is handed, so this must never be your main working session's token. (It used to fall back to `oauth.refresh-token` in `.qontoctl.yaml`, which silently poisoned that session mid-run — the fallback was removed in [#671](https://github.com/alexey-pelykh/qontoctl/issues/671).) Without the env var the suite **skips cleanly**, leaving your main session intact.

1. Mint a disposable sandbox refresh token by logging in against a throwaway sandbox profile — one you are willing to have rotated and revoked, kept separate from your everyday profile:

    ```sh
    qontoctl auth login --profile sandbox-e2e
    ```

    (Any profile carrying sandbox OAuth credentials + a staging token works.)

2. Export that profile's `oauth.refresh-token` value (from `~/.qontoctl/sandbox-e2e.yaml`) as the seed, then run the full E2E suite:

    ```sh
    export QONTOCTL_E2E_OAUTH_REFRESH_TOKEN_LONG="<sandbox refresh token>"
    pnpm test:e2e
    ```

3. The suite consumes the seed on success (Qonto rotates per exchange). To re-run, mint a fresh token and re-export it:

    ```sh
    qontoctl auth login --profile sandbox-e2e
    export QONTOCTL_E2E_OAUTH_REFRESH_TOKEN_LONG="<fresh sandbox refresh token>"
    pnpm test:e2e
    ```

This mirrors the rotation cadence experienced by any qontoctl runtime that uses OAuth — refresh tokens are runtime-mutable state and live for one exchange.

The `_LONG` suffix is a maintainer-facing reminder that this token does not flow through the runtime config-overlay chain (`QONTOCTL_REFRESH_TOKEN` was removed as a runtime env var in [#495](https://github.com/alexey-pelykh/qontoctl/issues/495) precisely because env-overlay semantics are incompatible with per-exchange rotation). It is consumed on every successful run.

## Scope: what this covers and what stays excluded

| OAuth function       | E2E coverage status              | Notes                                                                                                                                                                                          |
| -------------------- | -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `refreshAccessToken` | Covered (this suite, local-only) | Asserts new access token + rotated refresh token + positive expiry against sandbox token endpoint.                                                                                             |
| `revokeToken`        | Covered (this suite, local-only) | Asserts revoked access token returns 401 on subsequent sandbox API call.                                                                                                                       |
| `exchangeCode`       | `accepted_gap` (no E2E coverage) | Authorization-code flow requires browser interaction (user authentication + consent); not headlessly automatable. The token-exchange request itself is unit-tested in `oauth-service.test.ts`. |

## Recommended cadence

Run before any release candidate where end-to-end OAuth coverage matters — see [`docs/release-runbook.md`](./release-runbook.md). The local-pre-PR full-suite gate (CLAUDE.md § E2E Testing) covers day-to-day work.

## Related

- [`docs/e2e-testing.md`](./e2e-testing.md) — full E2E categorization and gates
- [`docs/oauth-setup.md`](./oauth-setup.md) — OAuth app registration and the runtime `auth login` flow
- [`docs/sandbox-testing.md`](./sandbox-testing.md) — sandbox routing semantics and the staging-token header
- [#449](https://github.com/alexey-pelykh/qontoctl/issues/449) — umbrella issue for E2E coverage
- [#460](https://github.com/alexey-pelykh/qontoctl/issues/460) — original OAuth-flow E2E issue (closed; merged via #590)
- [#495](https://github.com/alexey-pelykh/qontoctl/issues/495) — why `QONTOCTL_REFRESH_TOKEN` was removed as a runtime env var (the rotation constraint that defines this suite's local-only scope)
- [#591](https://github.com/alexey-pelykh/qontoctl/issues/591) — mock-OAuth-server exploration for CI coverage (declined; this suite is local-only by design)
