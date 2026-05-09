# Configuration

QontoCtl reads its configuration from a YAML file plus a fixed set of
environment variables. This document is the canonical reference for the
**file-resolution chain** (which file gets loaded), the **per-field overlay**
(env vars that override file values), and the **migration story** for users
coming from pre-`0.x` builds that walked the current directory.

For credential format and authentication-method choice, see [`README.md`](../README.md#configuration)
(API key vs. OAuth) and [`oauth-setup.md`](./oauth-setup.md). For sandbox-specific
SCA setup, see [`sandbox-testing.md`](./sandbox-testing.md).

## File resolution

The resolver picks **exactly one** file (or no file, if env-only) using the
following precedence — highest wins, no further inputs are consulted once a
match is selected:

| Priority | Source                         | Selected when                                     |
| -------- | ------------------------------ | ------------------------------------------------- |
| 1        | `--config <path>` CLI flag     | Flag is supplied (any non-empty string)           |
| 2        | `QONTOCTL_CONFIG_FILE` env var | Env var is set to a non-empty string              |
| 3        | `~/.qontoctl/{profile}.yaml`   | `--profile <name>` is supplied (and 1, 2 are not) |
| 4        | `~/.qontoctl.yaml`             | Default — no flag, no env var, no profile         |

> **No current-directory discovery.** The resolver does **not** scan the working
> directory for `.qontoctl.yaml` and does not walk up the directory tree. This
> behavior was removed in
> [#479](https://github.com/alexey-pelykh/qontoctl/pull/502) to make the
> load destination deterministic regardless of where you invoke `qontoctl` from.
> See [Migration from CWD discovery](#migration-from-cwd-discovery) below.

### How each entry point resolves the path

- **CLI** (`qontoctl <command>`): walks priorities 1 → 4. When `--config` is
  supplied alongside `QONTOCTL_CONFIG_FILE` or `--profile` and the resolved
  paths disagree, `--config` wins and a one-line stderr warning surfaces the
  override.
- **MCP server** (`qontoctl mcp`): no CLI flags exist. The server captures
  `QONTOCTL_CONFIG_FILE` at **startup** and passes it to the resolver as the
  `path` option (priority 1 in the table). Subsequent `process.env` mutations
  cannot redirect later loads. With no env var set, the resolver falls through
  to the home default at priority 4.
- **E2E test harness** (`pnpm test:e2e`): the harness in
  `packages/e2e/src/sandbox.ts` injects `QONTOCTL_CONFIG_FILE` into spawned
  CLI subprocesses, pointing at the repo's `.qontoctl.yaml` (gitignored).
  See [`e2e-testing.md`](./e2e-testing.md).

## Profile semantics

A **profile** is a named credential set. `--profile acme` controls two things:

1. **The default file location** when neither `--config` nor
   `QONTOCTL_CONFIG_FILE` is supplied: `~/.qontoctl/acme.yaml`.
2. **The env-var prefix scope** for per-field overrides:
   `QONTOCTL_ACME_*` instead of `QONTOCTL_*`. This still applies even when
   `--config` overrides the file location, so `--profile acme --config /foo.yaml`
   loads `/foo.yaml` but reads `QONTOCTL_ACME_ORGANIZATION_SLUG` for env overlay.

Profile names must not contain path separators, parent-directory references
(`..`), glob characters, or shadow reserved env-var suffixes. Invalid names
are rejected with a `VALIDATION` error before any I/O.

## Per-field environment variable overlay

After a file is loaded (or skipped), the resolver overlays per-field env vars.
Env vars carry **inputs** (static configuration the tool reads but never
writes back); runtime-mutable state (refresh tokens, token expiry, granted
scopes) lives in the file only.

Without `--profile`:

| Variable                     | Field                       | Notes                                            |
| ---------------------------- | --------------------------- | ------------------------------------------------ |
| `QONTOCTL_ORGANIZATION_SLUG` | `api-key.organization-slug` |                                                  |
| `QONTOCTL_SECRET_KEY`        | `api-key.secret-key`        |                                                  |
| `QONTOCTL_CLIENT_ID`         | `oauth.client-id`           |                                                  |
| `QONTOCTL_CLIENT_SECRET`     | `oauth.client-secret`       |                                                  |
| `QONTOCTL_ACCESS_TOKEN`      | `oauth.access-token`        | Read-only — see semantics note below             |
| `QONTOCTL_ENDPOINT`          | `endpoint`                  | Custom API endpoint                              |
| `QONTOCTL_STAGING_TOKEN`     | `oauth.staging-token`       | Activates sandbox URLs                           |
| `QONTOCTL_SCA_METHOD`        | `sca.method`                | See [`sandbox-testing.md`](./sandbox-testing.md) |

With `--profile <name>`, the prefix becomes `QONTOCTL_{NAME}_` (uppercased,
hyphens replaced with underscores). For example, `--profile acme` reads
`QONTOCTL_ACME_ORGANIZATION_SLUG`.

> **`QONTOCTL_ACCESS_TOKEN` semantics**: when set, the env-supplied bearer is
> used for the current invocation only. Proactive token refresh is not
> attempted, and refreshed tokens are not persisted to disk (mirrors
> `AWS_SESSION_TOKEN`). If the token has expired, the API surfaces a `401`;
> re-issue the token externally.
>
> **`QONTOCTL_REFRESH_TOKEN` is intentionally not supported.** Refresh tokens
> are runtime-mutable state — every refresh produces a new value the tool
> must write back somewhere — and env vars carry inputs, not state. Use
> file-based credentials (`~/.qontoctl.yaml` or a profile) for OAuth flows
> that need refresh, or stick with API-key env vars in CI. See
> [#495](https://github.com/alexey-pelykh/qontoctl/pull/497).

## `QONTOCTL_CONFIG_FILE` — quick reference

The env var accepts an **absolute** or **relative** path. Relative paths are
passed through to the resolver verbatim — there is no implicit normalization
against CWD or the home directory beyond Node's own `path.resolve` semantics.
For predictable behavior in scripts and `direnv` shims, prefer absolute paths.

Empty string (e.g., from `QONTOCTL_CONFIG_FILE="$UNSET_VAR"` shell expansion)
is treated as "not set" — the resolver falls through to the next priority.

### CI usage

```sh
# CI (api-key only, points at a repo-checked-out config or env-only)
export QONTOCTL_ORGANIZATION_SLUG="$ORG"
export QONTOCTL_SECRET_KEY="$KEY"
qontoctl account list
```

### Repo-local development with `direnv`

[direnv](https://direnv.net/) auto-exports env vars when you `cd` into a
project. Recommended for daily development:

```sh
# .envrc (gitignored)
export QONTOCTL_CONFIG_FILE="$PWD/.qontoctl.yaml"
```

Then `direnv allow` once. Now any `qontoctl` invocation from the repo loads
the local file without a `--config` flag, and any other directory loads the
home default.

A starter template is in [`.envrc.example`](../.envrc.example) at the repo root.

### MCP client wiring

Most MCP host configs accept an `env` field. Point QontoCtl at a non-default
config without a wrapper script:

```jsonc
{
    "mcpServers": {
        "qontoctl": {
            "command": "npx",
            "args": ["qontoctl", "mcp"],
            "env": {
                "QONTOCTL_CONFIG_FILE": "/abs/path/to/qontoctl.yaml",
            },
        },
    },
}
```

The MCP server captures the env var at startup, so the path is frozen for
the lifetime of the server process.

## Migration from CWD discovery

Pre-`0.x` builds discovered `.qontoctl.yaml` by walking up from the current
working directory. That heuristic was removed in
[#479](https://github.com/alexey-pelykh/qontoctl/pull/502) because it made
the load destination depend on **where** you invoked `qontoctl` from, not
**which** project you intended to operate on — leading to silent
mis-targeting in scripts, CI matrix jobs, and editor-spawned subprocesses.

If you previously relied on CWD discovery, pick one of these replacements:

| Before                                        | After                                                                       |
| --------------------------------------------- | --------------------------------------------------------------------------- |
| `cd ~/projects/acme && qontoctl account list` | `qontoctl --config ~/projects/acme/.qontoctl.yaml account list`             |
| Repo-local `.qontoctl.yaml` auto-discovered   | `direnv` shim (see above) — auto-exports `QONTOCTL_CONFIG_FILE`             |
| CI script `cd repo && qontoctl ...`           | `QONTOCTL_CONFIG_FILE="$GITHUB_WORKSPACE/repo/.qontoctl.yaml" qontoctl ...` |
| Single-tenant home install                    | No change needed — `~/.qontoctl.yaml` still works at priority 4             |

The CLI emits no warning when the previously-discovered `./.qontoctl.yaml`
exists but is now ignored — adopt one of the explicit mechanisms above.

## See also

- [`oauth-setup.md`](./oauth-setup.md) — OAuth app registration and `auth login`/`auth refresh` flows.
- [`sandbox-testing.md`](./sandbox-testing.md) — sandbox setup including `mock` SCA flow.
- [`e2e-testing.md`](./e2e-testing.md) — E2E test taxonomy and credential gating.
- [`release-runbook.md`](./release-runbook.md) — release procedure.
