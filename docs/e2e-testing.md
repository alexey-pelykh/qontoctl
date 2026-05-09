# E2E Testing Guide

QontoCtl's E2E suites live in `packages/e2e/src/` and are organized per Qonto API
domain (clients, transfers, attachments, …). Each suite runs against a real Qonto
backend and is gated on the credential type its endpoints require, per the
[Qonto auth table](https://docs.qonto.com/get-started/business-api/authentication/introduction).

## Test taxonomy

Three suite categories, each gated on a different capability check from
`packages/e2e/src/sandbox.ts`:

| Category               | Gate                                                              | Runs in CI?              | Runs locally?                                    |
| ---------------------- | ----------------------------------------------------------------- | ------------------------ | ------------------------------------------------ |
| **API-key-compatible** | `describe.skipIf(!hasApiKeyCredentials())`                        | yes (CI is api-key-only) | yes when api-key configured                      |
| **OAuth-required**     | `describe.skipIf(!hasOAuthCredentials())`                         | no (CI has no OAuth)     | yes when OAuth configured                        |
| **OAuth + sandbox**    | `describe.skipIf(!hasOAuthCredentials() \|\| !hasStagingToken())` | no                       | yes when both OAuth and staging-token configured |

The gates are **capability-based**, not environment-based: a suite runs whenever
its required credentials are present, regardless of whether you're on a developer
laptop or in CI. CI naturally has only api-key credentials, so OAuth and sandbox
suites skip automatically — no `CI=true` check needed.

The categorization for each suite was derived from the Qonto auth table.
Endpoints listed as **"Both methods"** mark a suite as api-key-compatible;
endpoints listed as **"OAuth 2.0 only"** mark a suite as OAuth-required. Mixed
suites (e.g. `bulk-transfers`, which lists/retrieves with api-key but creates
with OAuth + SCA) are gated as OAuth-required overall, because a suite is
considered OAuth-required if **any** of its operations requires OAuth.

### Current categorization

**API-key-compatible** (run in CI):

attachments · clients · client-invoices · commands/beneficiary ·
commands/credit-note · commands/label · commands/membership ·
commands/mcp-beneficiaries · commands/mcp-labels-memberships ·
commands/mcp-requests · commands/request · internal-transfers ·
mcp/server (live block) · org-accounts · profile (live block) · statements ·
supplier-invoices · transactions · transfers

**OAuth-required** (local-only):

bulk-transfers · cards · einvoicing · insurance · international ·
intl-beneficiaries · intl-transfers · commands/payment-link ·
commands/mcp-payment-links · quotes · recurring-transfers · teams · webhooks

**OAuth + sandbox** (local-only, requires staging-token):

sca-continuation

**No credentials needed** (run anywhere):

auth · completions · profile (structural) · mcp/server (structural)

## CI behavior

The `e2e` job in `.github/workflows/ci.yml` runs against **production** with
api-key credentials:

```yaml
e2e:
    name: E2E
    needs: [ci]
    steps:
        - run: pnpm test:e2e
          env:
              QONTOCTL_ORGANIZATION_SLUG: ${{ secrets.QONTOCTL_ORGANIZATION_SLUG }}
              QONTOCTL_SECRET_KEY: ${{ secrets.QONTOCTL_SECRET_KEY }}
```

API key credentials never rotate (unlike OAuth refresh tokens, which Qonto
rotates on every `oauth/token` exchange — burning the GH-stored secret on
every run). The previous OAuth-based `e2e-sandbox` job was inherently fragile
for this reason; switching to api-key-only CI makes the E2E gate sustainable.

The `e2e` job is **not** part of the merge gate (only `ci-gate` is required by
branch protection). It runs informationally — failures surface but don't block
merging.

### Required GitHub secrets

To enable the `e2e` CI job, configure these repository secrets:

| Secret                       | Purpose          |
| ---------------------------- | ---------------- |
| `QONTOCTL_ORGANIZATION_SLUG` | api-key org slug |
| `QONTOCTL_SECRET_KEY`        | api-key secret   |

Old OAuth-related secrets (`QONTOCTL_STAGING_TOKEN`, `QONTOCTL_CLIENT_ID`,
`QONTOCTL_CLIENT_SECRET`, `QONTOCTL_ACCESS_TOKEN`) are no longer used by the
CI workflow and can be removed from repository settings.

> **Note on `QONTOCTL_REFRESH_TOKEN`**: this env var is **no longer read by
> qontoctl** (see issue #495). Refresh tokens are runtime-mutable state and
> were never compatible with env-overlay semantics — refresh would shadow
> rotated values on subsequent reads. If your CI relied on it, switch to
> api-key auth (above) or OAuth via file-based credentials.

## Running locally

`pnpm test:e2e` runs the full suite. Suites gate themselves based on what's
configured in `.qontoctl.yaml` (located via `QONTOCTL_CONFIG_FILE`,
`--config`, `--profile`, or the home default — see
[`docs/configuration.md`](./configuration.md) for the full chain) or
`QONTOCTL_*` environment variables.

The harness in `packages/e2e/src/sandbox.ts` injects `QONTOCTL_CONFIG_FILE`
into spawned CLI subprocesses, pointing at the repo's `.qontoctl.yaml`
(gitignored), so you can keep credentials in the repo without exporting the
env var in your shell.

To run **api-key-compatible suites only** (mirroring CI behavior):

```sh
QONTOCTL_ORGANIZATION_SLUG=<slug> QONTOCTL_SECRET_KEY=<key> pnpm test:e2e
# OR via .qontoctl.yaml with only the `api-key:` section
```

To run **everything including OAuth and sandbox** (typical developer flow):

```yaml
# .qontoctl.yaml
api-key:
    organization-slug: <slug>
    secret-key: <key>
oauth:
    client-id: <id>
    client-secret: <secret>
    staging-token: <token> # enables sandbox routing + sca-continuation suite
```

Then:

```sh
pnpm test:e2e
```

## When to use which credential type

- **api-key**: read-only access by default; supports many writes per the Qonto
  auth table (clients CRUD, internal transfers, attachments, …). Production
  endpoint only — there is no api-key-against-sandbox.
- **OAuth**: full access including OAuth-only endpoints (cards, teams, webhooks,
  e-invoicing, payment-links, insurance, international transfers, recurring
  transfers, bulk transfers' SCA-create flow, …) and sandbox via staging-token.

See [`docs/oauth-setup.md`](./oauth-setup.md) for OAuth app registration and
[`docs/sandbox-testing.md`](./sandbox-testing.md) for sandbox setup including
the `mock` SCA flow.
