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

sca-continuation · auth/oauth-flow

> The `auth/oauth-flow` suite has an **additional** gate beyond the
> standard OAuth + staging-token check: it requires a seed refresh token
> (`QONTOCTL_E2E_OAUTH_REFRESH_TOKEN_LONG` env var or `oauth.refresh-token`
> in `.qontoctl.yaml`). The seed is consumed on every successful run, and
> the suite is **local-only by design** — see
> [`docs/oauth-flow-e2e.md`](./oauth-flow-e2e.md) for the rationale and
> local rotation workflow.

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

To enable the `e2e` CI job's api-key-compatible suites, configure these
repository secrets:

| Secret                       | Purpose          |
| ---------------------------- | ---------------- |
| `QONTOCTL_ORGANIZATION_SLUG` | api-key org slug |
| `QONTOCTL_SECRET_KEY`        | api-key secret   |

The OAuth-flow suite (`auth/oauth-flow`) is **local-only by design** — it is
not wired to CI, and it stays that way. A mock-OAuth-server retrofit was
explored in [#591](https://github.com/alexey-pelykh/qontoctl/issues/591) and
declined — replaying recorded fixtures duplicates the existing CI unit
coverage of the OAuth client and forfeits the live-sandbox fidelity that is
the suite's reason to exist. See
[`docs/oauth-flow-e2e.md`](./oauth-flow-e2e.md) § Why this suite is local-only.

> **Note on `QONTOCTL_REFRESH_TOKEN`**: this env var is **no longer read by
> qontoctl at runtime** (see issue #495). Refresh tokens are runtime-mutable
> state and were never compatible with env-overlay semantics — refresh would
> shadow rotated values on subsequent reads. If your CI relied on it for
> runtime auth, switch to api-key auth (above) or OAuth via file-based
> credentials. For the OAuth-flow E2E suite specifically, see
> [`docs/oauth-flow-e2e.md`](./oauth-flow-e2e.md) — the suite is local-only
> by design and uses a dedicated `QONTOCTL_E2E_OAUTH_REFRESH_TOKEN_LONG`
> env var (or `oauth.refresh-token` in `.qontoctl.yaml`) scoped to tests
> only, not read by the runtime.

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

## Sandbox-data-dependent tests

Some Qonto endpoints behave differently per organization (subscription tier,
account configuration, prior data). E2E tests must not assume specific
resources exist, or that opt-in features are enabled. Three strategies cover
the spectrum, applied per-test in
[`packages/e2e/src/commands/payment-link.e2e.test.ts`](../packages/e2e/src/commands/payment-link.e2e.test.ts)
as the canonical reference:

### 1. Skip-if-empty

When a test needs a resource (e.g. payment link, invoice, beneficiary) to
exercise a `show`/`update`/`delete` flow, list first and skip when empty.
This is the dominant pattern for `show`-style tests:

```ts
const items = cliJson<{ id: string }[]>("payment-link", "list");
if (items.length === 0) return; // Skip: nothing to show
const first = items[0] as { id: string };
const detail = cliJson<unknown>("payment-link", "show", first.id);
```

### 2. Skip-if-feature-unavailable

When an endpoint returns HTTP 404 because a feature is not enabled (Qonto
Payment Links subscription, OAuth-only Embed scopes, …), wrap the CLI call
in [`skipIfNotFound`](../packages/e2e/src/helpers.ts) and bail on the
sentinel:

```ts
import { cliJson, SKIP, skipIfNotFound } from "../helpers.js";

const stdout = skipIfNotFound("--output", "json", "payment-link", "list");
if (stdout === SKIP) return; // Feature unavailable in this sandbox
const items = JSON.parse(stdout) as { id: string }[];
```

`skipIfNotFound` is a special case of
[`skipIfQontoStatus`](../packages/e2e/src/helpers.ts), which accepts an
arbitrary set of "OK to skip" HTTP statuses (e.g. `[403, 404]` for tools
gated by both subscription and OAuth scope). Both helpers re-throw on any
other failure, so genuine bugs surface as test failures.

### 3. Looser assertion

When a test validates structural properties (e.g. "list returns an array",
"each item has an `id`"), assert at the field level rather than calling
`Schema.parse(item)` for every element. The strict parse is brittle when
the sandbox returns slightly different shapes than production (or when the
schema is not yet aligned with the actual API response — see
[`docs/e2e-testing.md` § E2E in CI](#ci-behavior) for the production-only CI
caveat).

Use `Schema.parse` only on `show`-style tests where a single, fully-formed
resource is fetched.

### MCP analogue

MCP tools surface the same Qonto error payloads via the
`isError: true, content: [{ text: ... }]` wrapper. Tests detect feature
unavailability by inspecting the error text — see the
`isFeatureUnavailable` helper in
[`packages/e2e/src/commands/mcp-payment-links.e2e.test.ts`](../packages/e2e/src/commands/mcp-payment-links.e2e.test.ts)
for the canonical implementation. (The shared helpers module exposes
`firstTextFromMcpResult` to centralize the content-extraction
boilerplate.)

## Production-org-gated tests (sandbox-blocker pattern)

A small number of Qonto endpoints behave correctly in production but cannot
be exercised against the sandbox simulator at all — for example, `GET
/v2/sepa/transfers/{id}/proof` returns `404 not_found` for **every**
settled sandbox transfer (re-probed 2026-05-13 in #565). Skip-if-empty
and skip-if-feature-unavailable cannot help here because the resource is
provably absent across the entire sandbox surface; the only way to
exercise the code path end-to-end is to point the test at a real
production resource.

For these endpoints we use a **dedicated env var** as the opt-in gate:

```ts
import { hasApiKeyCredentials, hasTransferProofId, getTransferProofId } from "../sandbox.js";

describe.skipIf(!hasApiKeyCredentials() || !hasTransferProofId())(
    "transfer CLI commands (e2e, production-org proof — opt-in via QONTOCTL_TRANSFER_PROOF_ID)",
    () => {
        it("downloads a valid PDF", () => {
            const id = getTransferProofId();
            // ...exercise the endpoint, assert against the real production resource...
        });
    },
);
```

**Properties of this gate:**

- **CI never sets the env var** → the suite skips naturally in CI without
  any CI-side configuration.
- **Local devs without the env var** also skip naturally — no behavior
  change for the default `pnpm test:e2e` flow.
- **Local devs who opt in** export the env var with a real production
  resource ID (e.g. `QONTOCTL_TRANSFER_PROOF_ID=01234567-...`) alongside
  production credentials.
- The dev is responsible for **routing to production** in the same shell
  (i.e. unsetting `QONTOCTL_STAGING_TOKEN` or using a profile without one).
  A sandbox-routed request will 404 deterministically.

**When to use this pattern:** only when both of the following hold:

1. Empirical probing has shown the endpoint is **uniformly broken** in
   sandbox (not a per-org config issue, not a feature flag — the simulator
   simply does not produce the resource).
2. The production resource can be **read-only**, with no side effects —
   safe to exercise repeatedly against a real org. Mutating endpoints
   should never be production-org-gated.

**Coverage manifest:** mark the surface as `covered` (the test exists and
binds AC #2/AC #3) and mention the env var in `notes`. The opt-in nature
is encoded in the test description and the env var name; the coverage
detector does not need a separate state for this.

**Helpers** (in [`packages/e2e/src/sandbox.ts`](../packages/e2e/src/sandbox.ts)):

| Helper                 | Purpose                                                                        |
| ---------------------- | ------------------------------------------------------------------------------ |
| `hasTransferProofId()` | True iff `QONTOCTL_TRANSFER_PROOF_ID` is set. Use as a `describe.skipIf` term. |
| `getTransferProofId()` | Read the env var; throws if unset. Guard with `hasTransferProofId()` first.    |

When adding a new production-org-gated endpoint, mirror this pair for the
new env var (e.g. `hasFooBarId()` / `getFooBarId()`).

### Helpers reference

[`packages/e2e/src/helpers.ts`](../packages/e2e/src/helpers.ts) exports the
shared helpers used across E2E suites:

| Helper                   | Purpose                                                                   |
| ------------------------ | ------------------------------------------------------------------------- |
| `cli(...args)`           | Spawn the bundled CLI; throws on non-zero exit (canonical invocation).    |
| `cliJson<T>(...args)`    | `cli` with `--output json` prepended; returns parsed JSON.                |
| `cliRaw(args, opts?)`    | Structured `{ ok, stdout } \| { ok: false, status, stdout, stderr }`.     |
| `skipIfNotFound(...)`    | Run CLI, return `SKIP` on HTTP 404, throw on any other error.             |
| `skipIfQontoStatus(...)` | Generalized form taking `readonly number[]` of skippable statuses.        |
| `qontoHttpStatus(text)`  | Extract status from CLI's `Qonto API error (HTTP NNN):` stderr prefix.    |
| `firstTextFromMcpResult` | Extract the first text-typed content entry from an MCP `callTool` result. |
| `CLI_PATH`               | Absolute path to the bundled CLI binary (for spawning MCP transport).     |

Tests that adopt the helpers should remove their inlined copies of the
same boilerplate to keep the codebase DRY — the helpers are the single
source of truth for "how E2E tests talk to the CLI / MCP server".

## Order-independence invariant

**The invariant.** No test may depend on another test's side effects
except within an explicit CRUD-lifecycle `describe` block using the
[`LifecycleSkipCarrier`](../packages/e2e/src/helpers.ts) pattern. Across
files and across sibling describes, every test must run from a clean
starting state — its outcome must be the same whether the suite runs in
declaration order, reverse order, or any random permutation.

**Why.** The E2E suite shares a single Qonto sandbox org across all
tests in a run. Hidden cross-test dependencies (a `let` at file scope
populated by one test and read by another, a sandbox-state mutation
that primes a later test, a singleton OAuth token leaked between
suites) make the suite a slot machine: outcomes depend on which test
ran first, which is implicit in vitest's declaration order and the
filesystem walk that `vitest.e2e.config.ts` produces. When the order
matters and nobody designed it to, a test failure may flip to pass on
re-run — the silent flake that wasted ~2 weeks chasing #496 (epic
[#603](https://github.com/alexey-pelykh/qontoctl/issues/603) §1.1).

**The lifecycle-`describe` carve-out.** Tests that CRUD a resource
inherently depend on each other (`create` populates `createdId`,
`update` reads it). The legitimate pattern is to declare the shared
state inside the `describe` block that owns the lifecycle:

```ts
describe.skipIf(!hasApiKeyCredentials())("client commands (e2e)", () => {
    describe("client CRUD lifecycle", () => {
        const lifecycleSkip: LifecycleSkipCarrier = { reason: undefined };
        let createdClientId: string | undefined;

        it("creates a client", async (ctx) => {
            /* populates createdClientId */
        });
        it("shows the created client", async (ctx) => {
            skipIfUpstreamSkipped(lifecycleSkip, ctx);
            const id = assertLifecycleState(createdClientId, "createdClientId");
            /* ... */
        });
        // updates, deletes follow the same pattern
    });
});
```

The shared `let` is scoped to the `describe` — vitest's
`fileParallelism: false` (set in
[`vitest.e2e.config.ts`](../vitest.e2e.config.ts)) guarantees the
chain runs in declaration order within a single worker, and the
`LifecycleSkipCarrier` propagates skips visibly without leaking state
across sibling describes or files.

**The forbidden pattern.**

```ts
// ❌ Module-scope `let` shared across `it()` blocks — order-dependent across the suite.
let createdId: string | undefined;

describe("foo", () => {
    it("creates", () => {
        createdId = "...";
    });
});

describe("bar", () => {
    it("uses", () => {
        /* reads createdId — depends on "foo" running first */
    });
});
```

This is enforced two ways:

1. **Lint guard** (authoring time):
   [`eslint-rules/no-module-scope-mutable-state-in-e2e.js`](../eslint-rules/no-module-scope-mutable-state-in-e2e.js)
   flags any `let` or `var` declared at the top level of a
   `*.e2e.test.ts` file. Runs as part of `pnpm lint`.
2. **Pre-release diff** (run time): `pnpm order-independence-check`
   (script at
   [`scripts/check-order-independence.sh`](../scripts/check-order-independence.sh))
   runs the E2E suite twice — default file order and shuffled
   (`--sequence.shuffle.files`) — and diffs the pass/fail/skip
   classification of every test. A test whose outcome differs across
   runs is flagged for state-isolation review (epic #603 R-OI-2).
   Skip-reason text may differ legitimately; pass/fail/skip
   _membership_ may not.

When the pre-release diff flags a test, the remediation is one of:

- Move the cross-test state into a CRUD-lifecycle `describe` (as
  above), or
- Add a `beforeEach`/`afterEach` to reset the state, or
- If the dependency is on sandbox state (not in-process state), document
  the precondition in
  [`docs/qonto-sandbox-preconditions.md`](./qonto-sandbox-preconditions.md)
  (epic #603 §7) and either satisfy the precondition or
  `ctx.skip("sandbox-precondition: ...")`.

See [`docs/designs/e2e-test-reliability.md`](./designs/e2e-test-reliability.md)
§8.3 for the full design rationale.
