# Troubleshooting

> **First step when something doesn't work: run `qontoctl diagnose`.**

`qontoctl diagnose` is a read-only healthcheck that probes every layer of your
qontoctl integration — config resolution, credential presence, api-key health,
OAuth health, granted scopes, organization metadata, bank-account count,
e-invoicing settings, and host routing — and reports a status line per check
plus a one-line summary. It is the single command to run before opening a bug
report or asking for help.

## Quick start

```sh
qontoctl diagnose
```

Output (TTY default) looks like:

```
✓ config.resolution         loaded from ~/.qontoctl.yaml
✓ auth.credentials-present  api-key + oauth configured
✓ auth.api-key-health       200 OK (89ms)
⚠ auth.oauth-health         refreshed expired access token (148ms)
✓ auth.scopes               34 scopes granted
✓ org.metadata              acme-1 (ACME Inc) (76ms)
✓ org.bank-accounts-count   2 bank accounts (0ms)
✓ org.einvoicing-settings   sending=disabled, receiving=disabled (82ms)
✓ routing.host-target       sandbox host (staging-token present)

Summary: 8 ok, 1 warn, 0 fail, 0 skip
Exit code: 2
```

Markers map to status:

| Marker | Status | Meaning                                                        |
| ------ | ------ | -------------------------------------------------------------- |
| `✓`    | ok     | Check passed                                                   |
| `⚠`    | warn   | Check passed but warrants attention (e.g., token refreshed)    |
| `✗`    | fail   | Check failed; `suggested_action` describes the remediation     |
| `—`    | skip   | Check did not run (missing creds, missing staging-token, etc.) |

Use `--ascii` if your terminal does not render unicode markers.

## Exit codes

Diagnose exits with one of four codes (matches the `R-EC-*` requirements in
the [PRD](./prds/qontoctl-diagnose.md)):

| Code | Meaning                                                                |
| ---- | ---------------------------------------------------------------------- |
| `0`  | All checks `ok` or `skip`                                              |
| `1`  | Any check `fail`                                                       |
| `2`  | Any check `warn` but no `fail`                                         |
| `10` | Fatal initialization error (config file unreadable, parse error, etc.) |

This makes diagnose suitable as a CI healthcheck or as the first step of an
operational runbook.

## Output formats

```sh
qontoctl diagnose                              # table on TTY, JSON otherwise
qontoctl diagnose --diagnose-output table       # explicit table
qontoctl diagnose --diagnose-output json        # explicit JSON
qontoctl diagnose --diagnose-output json --frozen-timestamp \
                                               # hidden flag — byte-identical output
                                               # for diff-based regression tests
```

JSON output sorts object keys alphabetically at every level so back-to-back
runs against an unchanged state are byte-identical.

## Reading the report

Each check returns a structured record:

```jsonc
{
    "checkId": "auth.oauth-health",
    "status": "warn",
    "detail": "refreshed expired access token",
    "suggestedAction": null,
    "evidence": { "refreshed": true, "status_code": 200 },
    "latencyMs": 148,
}
```

- `checkId` — stable identifier in `domain.check` form. Safe to script against.
- `status` — one of `ok` / `warn` / `fail` / `skip`.
- `detail` — short human-readable string. Subject to a global redaction
  tripwire (see [Redaction](#redaction)).
- `suggestedAction` — concrete next step when the check is not `ok`, or `null`.
- `evidence` — small structured payload, redacted to a per-check whitelist.
- `latencyMs` — wall-clock for `live` checks (omitted for static / cached / frozen).

## Common failure modes and what they mean

### `auth.api-key-health: fail` (HTTP 401/403)

Your api-key was rejected by Qonto. The most common causes:

1. The `api-key.organization-slug` does not match the slug Qonto issued.
2. The `api-key.secret-key` was regenerated and the local config is stale.
3. You're hitting production with a sandbox-only key (or vice versa).

`suggestedAction`: re-check the values in your config or env vars; the slug is
visible in the Qonto web app under Settings → API.

### `auth.oauth-health: fail` (refresh failed)

The OAuth refresh token has expired or been revoked. Refresh tokens silently
die after long periods of inactivity (this is documented behavior on Qonto's
side). Run `qontoctl auth login` to obtain a fresh token.

### `auth.oauth-health: warn` (refreshed)

The access token was expired (or within the 60-second refresh window) and
diagnose successfully refreshed it. Nothing to do — your config has been
updated with the new token. The `warn` exists so the silent refresh is visible.

### `auth.scopes: warn` (no scopes configured)

OAuth credentials are present but no scopes are recorded. Run `qontoctl auth
setup` to choose scopes, then `qontoctl auth login`.

### `routing.host-target: warn` (routing mismatch)

You have a `staging-token` configured but `endpoint` overrides the host to
production (or vice versa). Diagnose tells you what was expected. Either
remove the `endpoint` override or adjust the `staging-token` so the routing
matches your intent.

### `org.einvoicing-settings: fail` (HTTP 403)

The OAuth token does not have the `einvoicing.read` scope. Add it via
`qontoctl auth setup` then `qontoctl auth login`.

## Verbose mode

`--verbose` (or `-v`) appends `suggested_action` and `evidence` under each
check in table mode. Use this when triaging a failed run:

```sh
qontoctl diagnose --verbose
```

`--debug` is reserved for future deep introspection (HTTP request/response
capture); it currently mirrors `--verbose`.

## Redaction

Diagnose is read-only by construction (no flag can make it mutate state) and
runs a two-layer redactor on every output channel:

1. **Per-check whitelist**: each check declares the fields allowed through to
   `evidence`. Any other field a check accidentally adds is dropped.
2. **Global tripwire**: a final regex pass over the rendered output scrubs
   anything matching JWT-style tokens, `Bearer` headers, full IBANs, and
   13–19 digit number runs (PAN-shaped). Literal credential values from
   config are also scrubbed by exact-string match.

If you ever observe an unredacted credential in diagnose output, please
report it as a security issue per [`docs/security`](./security).

## Running via MCP

If you use qontoctl as an MCP server, the `diagnose` tool is exposed
read-only:

```json
{
    "name": "diagnose",
    "arguments": { "profile": "production" } // profile is optional
}
```

When the server is launched with a profile — `qontoctl mcp --profile production`
(or `--config <path>`) — `diagnose` resolves credentials through that same
launch profile automatically, so the `profile` argument can be omitted; pass it
only to probe a _different_ profile than the one the server was started with
([#658](https://github.com/alexey-pelykh/qontoctl/issues/658)).

Output is the same JSON shape as `qontoctl diagnose --diagnose-output json`.

## Relationship to `qontoctl auth status`

`auth status` is a focused OAuth-only command — it shows token expiration and
remaining lifetime. `diagnose` is the superset: it includes everything `auth
status` reports plus the broader integration health. Use `auth status` when
you only care about OAuth; use `diagnose` everywhere else.

## When diagnose isn't enough

If diagnose reports all-ok but a specific command still fails:

1. Re-run with `--verbose` to see the underlying HTTP request/response shape.
2. Check the relevant Qonto API documentation page for endpoint-specific
   requirements (some endpoints require scopes that are not in the
   recommended set).
3. Open an issue at <https://github.com/alexey-pelykh/qontoctl/issues> with
   the JSON output of `qontoctl diagnose --diagnose-output json` attached.

## See also

- [`README.md`](../README.md) — installation and quick start
- [`docs/configuration.md`](./configuration.md) — config file format and resolution chain
- [`docs/oauth-setup.md`](./oauth-setup.md) — OAuth app registration
- [`docs/sandbox-testing.md`](./sandbox-testing.md) — sandbox + staging-token setup
- PRD: [`docs/prds/qontoctl-diagnose.md`](./prds/qontoctl-diagnose.md)
- Design: [`docs/designs/qontoctl-diagnose.md`](./designs/qontoctl-diagnose.md)
