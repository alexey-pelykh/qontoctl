# CI OAuth Secrets

This guide documents the GitHub Actions secrets required to run the OAuth-flow
E2E suite (`packages/e2e/src/auth/oauth-flow.e2e.test.ts`) and the operational
strategy for rotating them.

Most E2E suites in `packages/e2e/src/` run against the Qonto production API
with api-key credentials (see [`docs/e2e-testing.md`](./e2e-testing.md)). The
**OAuth-flow** suite is the exception: it exercises `refreshAccessToken` and
`revokeToken` (`packages/core/src/auth/oauth-service.ts`) by round-tripping
against the real Qonto sandbox OAuth server. This requires sandbox OAuth
credentials AND a seed refresh token — neither of which CI carries by default.

## Why a dedicated secrets surface

`QONTOCTL_REFRESH_TOKEN` was removed as a runtime env var in [#495](https://github.com/alexey-pelykh/qontoctl/issues/495)
because Qonto rotates refresh tokens on **every** `oauth/token` exchange — env
overlay semantics would shadow the rotated value on subsequent reads, leaving
qontoctl stuck on a burned token. The OAuth-flow E2E suite has the same
constraint but a narrower scope: it consumes one refresh token per CI run and
makes no claim that the seed is reusable.

To keep the runtime contract clean while still enabling the E2E suite to run
in CI, the suite reads a **dedicated** env var with a name that signals its
intent — `QONTOCTL_E2E_OAUTH_REFRESH_TOKEN_LONG`. The `_LONG` suffix is a
maintainer-facing reminder: this token lives in CI longer than typical runtime
refresh tokens (until manually rotated), but is still consumed on every
successful run.

## Required GitHub Actions secrets

To enable the OAuth-flow E2E suite in CI, configure these repository secrets:

| Secret                                  | Source                                                                  | Notes                                               |
| --------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------- |
| `QONTOCTL_CLIENT_ID`                    | Sandbox OAuth app Client ID (from `developers-sandbox.qonto.com`)       | Static — does not rotate                            |
| `QONTOCTL_CLIENT_SECRET`                | Sandbox OAuth app Client Secret                                         | Static — does not rotate                            |
| `QONTOCTL_STAGING_TOKEN`                | Sandbox staging token (issued separately by Qonto)                      | Static — routes requests to sandbox endpoints       |
| `QONTOCTL_E2E_OAUTH_REFRESH_TOKEN_LONG` | A sandbox refresh token freshly issued by `qontoctl auth login` locally | **Consumed on every successful CI run** — see below |

When all four secrets are present **and plumbed into the workflow env**, the
OAuth-flow E2E suite runs against the sandbox. When any one is missing, the
suite skips naturally — no `CI=true` check is needed (the gate is
capability-based).

### Workflow plumbing is intentionally deferred

The `.github/workflows/ci.yml` `e2e` job currently passes ONLY the two api-key
secrets (`QONTOCTL_ORGANIZATION_SLUG`, `QONTOCTL_SECRET_KEY`) to the test
step's env. The four OAuth-flow secrets above are **not** yet plumbed — so
even if you set them, the suite still skips in CI.

This deferral is intentional. The existing OAuth-required E2E suites (cards,
webhooks, intl-transfers, …) gate on `hasOAuthCredentials()`. The moment
`QONTOCTL_CLIENT_ID` and `QONTOCTL_CLIENT_SECRET` are exported to the e2e
step, those suites stop skipping and start failing — because CI has no
working OAuth access/refresh token for the non-flow suites. The OAuth-flow
suite has its own dedicated seed via `QONTOCTL_E2E_OAUTH_REFRESH_TOKEN_LONG`,
but that token is consumed per run and isn't a viable runtime token for the
other suites.

To enable the OAuth-flow suite in CI, the maintainer must EITHER:

1. **Per-step env scoping** — split the OAuth-flow suite into its own CI
   job (or its own `pnpm test:e2e` invocation with a vitest `--include` filter)
   so the OAuth-flow env vars are visible only to that job/step. Other OAuth
   suites continue to skip naturally because their env scope still lacks the
   client credentials.
2. **Plumb everything and accept other failures** — add the four OAuth-flow
   env vars to the `e2e` job env. The OAuth-flow suite passes (until its
   token is consumed); the other OAuth-required suites fail. The `e2e` job is
   not part of the merge gate (only `ci-gate` is), so this is operationally
   acceptable as a transition state until those other suites get working CI
   tokens (separate scope from #460).

Option 1 is the cleaner path; option 2 is the expedient one. Both are
deferred to a follow-up PR — #460 ships the test infrastructure, helpers,
documentation, and coverage manifest updates. The maintainer activates CI
when they're ready.

## One-time-use rotation strategy

The OAuth-flow E2E suite **does not** persist the rotated refresh token back
into `QONTOCTL_E2E_OAUTH_REFRESH_TOKEN_LONG`. After every successful run, the
seed token stored in GitHub Actions is invalid. This is the simpler of the two
strategies allowed by [#460](https://github.com/alexey-pelykh/qontoctl/issues/460)
AC ("persists rotated refresh back into CI secret **or** accepts one-time-use
refresh strategy") — chosen because in-pipeline secret rotation requires the
job to hold a GitHub PAT with `secrets:write`, which is operationally heavier
than periodic manual rotation.

**Operational consequence**: the OAuth-flow E2E job runs green at most ONCE
between rotations. After a successful run, the maintainer must re-seed the
secret. Failure to re-seed surfaces as the suite failing (or skipping if also
absent) on subsequent runs.

### How to rotate

1. Locally, log in to the Qonto sandbox OAuth app via:

    ```sh
    qontoctl auth login --profile sandbox
    ```

    (Or whichever profile carries the sandbox OAuth credentials + staging token.)

2. Read the freshly-issued refresh token from the profile:

    ```sh
    grep -A1 'refresh-token' ~/.qontoctl/sandbox.yaml | head -2
    ```

3. Update the GitHub secret:

    ```sh
    gh secret set QONTOCTL_E2E_OAUTH_REFRESH_TOKEN_LONG \
        --body "<the-refresh-token-value>" \
        --repo alexey-pelykh/qontoctl
    ```

4. Trigger the CI workflow on the relevant branch to verify the suite passes.

### Recommended rotation cadence

There is no automated reminder. Rotate:

- **Reactively**: when the OAuth-flow CI job reports failure with `401`
  / `invalid_grant`. The cost of failure is bounded — the E2E job is
  informational (not part of the merge gate), so a stale seed never blocks
  development.
- **Proactively**: before any release candidate where end-to-end OAuth
  coverage matters (release runbook in [`docs/release-runbook.md`](./release-runbook.md)).

## Scope: what this enables and what stays excluded

| OAuth function       | E2E coverage status              | Notes                                                                                              |
| -------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------- |
| `refreshAccessToken` | Covered (this suite)             | Asserts new access token + rotated refresh token + positive expiry against sandbox token endpoint. |
| `revokeToken`        | Covered (this suite)             | Asserts revoked access token returns 401 on subsequent sandbox API call.                           |
| `exchangeCode`       | `accepted_gap` (no E2E coverage) | See [§ Why `exchangeCode` is not covered](#why-exchangecode-is-not-covered) below.                 |

### Why `exchangeCode` is not covered

The authorization-code flow requires browser interaction (user authentication
and consent at the Qonto authorization endpoint). It cannot be automated
headlessly without significant test infrastructure investment — either a mock
OAuth server (which would exercise our HTTP layer but not the real Qonto
authorization endpoint) or a headless-browser harness (operationally heavy for
one code path).

The runtime code path is exercised manually via `qontoctl auth login` during
sandbox/production setup, and the shared `requestTokens` helper that
`exchangeCode` uses is exercised by the `refreshAccessToken` suite — so the
HTTP/parse layers stay covered even though the authorization-code-specific
glue does not.

## Local development

For local development, the same suite reads `oauth.refresh-token` from
`.qontoctl.yaml` as a fallback when the CI env var is absent. The typical
local flow:

```sh
qontoctl auth login                  # populates oauth.refresh-token
pnpm test:e2e                        # OAuth-flow suite picks up the token
qontoctl auth login                  # re-issue after the test consumes it
```

This mirrors the CI rotation cadence but with `auth login` as the rotation
operator instead of `gh secret set`.

## Related

- [`docs/e2e-testing.md`](./e2e-testing.md) — full E2E categorization and gates
- [`docs/oauth-setup.md`](./oauth-setup.md) — OAuth app registration and the
  runtime `auth login` flow
- [`docs/sandbox-testing.md`](./sandbox-testing.md) — sandbox routing semantics
  and the staging-token header
- [#449](https://github.com/alexey-pelykh/qontoctl/issues/449) — umbrella issue
  for E2E coverage of every Qonto API endpoint qontoctl uses
- [#495](https://github.com/alexey-pelykh/qontoctl/issues/495) — why
  `QONTOCTL_REFRESH_TOKEN` was removed as a runtime env var (the constraint
  that motivates the dedicated `_LONG` secret surface)
