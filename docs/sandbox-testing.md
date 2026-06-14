# Sandbox Testing Guide

Notes for exercising QontoCtl against the [Qonto sandbox](https://docs.qonto.com/api-reference/business-api/authentication/sca/sca-flows). Production users do not need to read this — the sandbox-only behavior described here is gated behind a staging token and never auto-engages on production traffic.

> Sandbox accepts **both OAuth and api-key authentication** when the staging token is set — sandbox routing is determined by the `X-Qonto-Staging-Token` header, not by auth type. The examples below focus on OAuth (the primary sandbox dev/test flow), but the same staging-token mechanism routes api-key requests to the sandbox host.

## Why this guide exists

Sandbox accounts cannot enroll a real paired device. Without an enrollment, every "write" request to Qonto (create transfer, update card, …) returns `428 sca_not_enrolled` regardless of credentials. The Qonto sandbox provides a `mock` SCA flow for this, but it is opt-in via the `X-Qonto-2fa-Preference` HTTP header. QontoCtl exposes that header through:

- The `sca.method` config field
- The `QONTOCTL_SCA_METHOD` env var (and profile-scoped `QONTOCTL_{PROFILE}_SCA_METHOD`)
- The hidden `--sca-method <value>` CLI flag (advanced; for testing)

When a [staging token](./oauth-setup.md#sandbox-setup) is configured and `sca.method` is **unset**, QontoCtl auto-defaults to `mock` so sandbox writes work out-of-the-box. **Production paths never auto-default**: omit the staging token and the header is omitted, letting Qonto apply its own rules.

## Allowed values

| Value           | Where        | Notes                                                                                        |
| --------------- | ------------ | -------------------------------------------------------------------------------------------- |
| `paired-device` | Production   | Default when the header is omitted; requires the user to have enrolled a paired device.      |
| `passkey`       | Production   | Passkey-based SCA.                                                                           |
| `sms-otp`       | Production   | SMS one-time-password fallback.                                                              |
| `mock`          | Sandbox only | Triggers a mock SCA challenge that can be approved via `qontoctl sca-session mock-decision`. |

Setting `mock` against the production endpoint is a configuration error — Qonto will reject the request. Setting any of `paired-device` / `passkey` / `sms-otp` against a sandbox account that hasn't enrolled returns `428 sca_not_enrolled`.

## Configuration

### Profile YAML

```yaml
oauth:
    client-id: "sandbox-client-id"
    client-secret: "sandbox-client-secret"
    staging-token: "your-staging-token"
sca:
    method: mock # explicit; auto-defaults to "mock" when omitted in sandbox
```

### Environment variables

```sh
export QONTOCTL_STAGING_TOKEN="your-staging-token"
export QONTOCTL_CLIENT_ID="sandbox-client-id"
export QONTOCTL_CLIENT_SECRET="sandbox-client-secret"

# Optional — only needed if you want to override the sandbox auto-default
export QONTOCTL_SCA_METHOD="mock"
```

With a named profile, every variable picks up the profile prefix:

```sh
export QONTOCTL_SANDBOX_STAGING_TOKEN="..."
export QONTOCTL_SANDBOX_SCA_METHOD="mock"
```

### CLI flag (testing only)

```sh
qontoctl --sca-method paired-device transfer create ...
```

The flag is **hidden from `--help`** because end users should not need it: production defaults are correct, sandbox auto-defaults to `mock`. It exists so engineers can override the resolved value when reproducing sandbox edge cases.

## Precedence

Highest wins:

1. `--sca-method <value>` CLI flag
2. `QONTOCTL_SCA_METHOD` env var (and profile-scoped variant)
3. `sca.method` field in the profile YAML
4. Sandbox auto-default `"mock"` (only when a staging token is configured)
5. Otherwise: header is omitted (Qonto applies its own default — `paired-device` in production)

## MCP server behavior

The MCP server resolves the SCA method from **environment / config only** — there is no MCP tool input parameter for it. This is deliberate: letting an LLM client choose the SCA method on a write is a threat-model risk in production. Operators control the SCA method by setting env vars or config; the LLM cannot.

Sandbox MCP testing has two equivalent setups:

**Env-only** (no config file):

```sh
QONTOCTL_STAGING_TOKEN="..." \
  QONTOCTL_CLIENT_ID="..." \
  QONTOCTL_CLIENT_SECRET="..." \
  qontoctl mcp  # auto-defaults sca.method to "mock"
```

**Config-file pointer** (when credentials live in a YAML file):

```sh
QONTOCTL_CONFIG_FILE="$PWD/.qontoctl.yaml" qontoctl mcp
```

In MCP host configs, the same env var goes in the `env` block — see
[`docs/configuration.md`](./configuration.md#mcp-client-wiring) for the
full pattern. The standalone `qontoctl-mcp` binary has no CLI flags, so
`QONTOCTL_CONFIG_FILE` is the only way to point it at a non-default file; the
`qontoctl mcp` subcommand shown above additionally accepts `--config` /
`--profile`.

## Approving sandbox SCA challenges

Once a write returns `428 sca_required` with a session token, approve via:

```sh
qontoctl sca-session mock-decision <token> allow
```

The corresponding MCP tool is `sca_session_mock_decision`. Both are sandbox-only and refuse to run when no staging token is configured.

### Auto-approving in a single CLI invocation

The `--sca-auto-approve <decision>` flag (sandbox-only) tells the CLI to fire `mock-decision` against the captured SCA session token **before** polling begins, so SCA-gated writes complete in a single CLI invocation without external orchestration.

```sh
# Explicit:
qontoctl --sca-auto-approve allow transfer create --beneficiary ben_… …
qontoctl --sca-auto-approve deny  transfer create --beneficiary ben_… …  # tests the deny path
```

Behavior:

- Values: `allow` (approves the challenge) or `deny` (rejects it). Commander enforces the enum at parse time.
- **Auto-defaults to `allow`** when both conditions are true:
    - A staging token is configured (`oauth.staging-token` or `QONTOCTL_STAGING_TOKEN`).
    - The resolved `sca.method` is `"mock"` (the sandbox auto-default or an explicit setting).

    Users who want to test the deny path opt in explicitly via `--sca-auto-approve deny`.

- **Rejected against production paths.** Without a staging token, the flag throws up-front:

    ```text
    --sca-auto-approve is only available in the Qonto sandbox environment.
    Configure `oauth.staging-token` in your config or set `QONTOCTL_STAGING_TOKEN`.
    ```

    This guarantees the flag cannot accidentally engage in production, where the `mocked_sca_sessions` endpoint does not exist.

- **Hidden from `--help`** because end users in production should never need it; sandbox users get the auto-default behavior automatically.
- **Not exposed via MCP** — like `--sca-method`, choosing the SCA outcome on a write is a threat-model risk in production and is intentionally not surfaced as a tool input.

When the sandbox mock path is active, the CLI spinner copy switches from `"Waiting for SCA approval on your Qonto mobile app..."` to `"Waiting for SCA mock-decision..."` to disambiguate the flow from a real-device challenge.

### Precedence

Highest wins:

1. `--sca-auto-approve <decision>` CLI flag
2. Sandbox auto-default `"allow"` (only when a staging token is configured **and** the resolved `sca.method` is `"mock"`)
3. Otherwise: no auto-approve — the CLI polls until the session is resolved externally (e.g., via `qontoctl sca-session mock-decision <token> allow` in another terminal).

## See also

- [`oauth-setup.md`](./oauth-setup.md) — OAuth app registration, including sandbox setup
- [`security/sca-token-binding.md`](./security/sca-token-binding.md) — empirical verification of SCA token request-binding (PSD2 Art. 5)
- [Qonto SCA flow reference](https://docs.qonto.com/api-reference/business-api/authentication/sca/sca-flows)
