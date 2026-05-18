# Release Runbook

This runbook is the canonical procedure for cutting a QontoCtl release. Read it end-to-end before tagging.

## Overview

QontoCtl publishes a coordinated set of npm packages from a single git tag, then republishes the Homebrew formula:

| Package          | Registry     | Role                                      |
| ---------------- | ------------ | ----------------------------------------- |
| `@qontoctl/core` | npm (public) | Qonto API client and service layer (leaf) |
| `@qontoctl/cli`  | npm (public) | CLI commands (depends on core)            |
| `@qontoctl/mcp`  | npm (public) | MCP server (depends on core)              |
| `qontoctl`       | npm (public) | Umbrella binary (composes CLI + MCP)      |
| `qontoctl/tap`   | Homebrew tap | `brew install qontoctl/tap/qontoctl`      |

All four npm packages ship under the **same version**, stamped from the git tag at release time by the `Stamp version` step in [`.github/workflows/release.yml`](../.github/workflows/release.yml).

The umbrella `qontoctl` package is **self-contained from v2.0.1 onwards**: its tarball embeds `@qontoctl/cli` + `@qontoctl/mcp` and their full transitive closure (internal `@qontoctl/core` + 3rd-party `commander`, `yaml`, `@clack/prompts`, `@modelcontextprotocol/sdk`, `zod`, `proper-lockfile`, plus their transitives). The release workflow assembles this via `pnpm deploy` (hoisted linker) + `pnpm pack` from the deploy target; the umbrella's `bundleDependencies: ["@qontoctl/cli", "@qontoctl/mcp"]` is the flag that tells pnpm/npm to include `node_modules/` in the tarball. See [§ Why the umbrella is self-contained](#why-the-umbrella-is-self-contained) for the rationale and the CI guard that enforces it.

## Release Cadence

On demand. Trigger criteria: meaningful user-visible changes accumulated in `CHANGELOG.md [Unreleased]`, a security fix needing prompt distribution, or a regression that warrants a patch.

## Versioning

QontoCtl follows [Semantic Versioning 2.0.0](https://semver.org/) at the umbrella level, and the umbrella version is derived from the highest-impact change across the four packages.

### Per-Package Decision Framework

Apply semver per package, then take the **highest impact across the four** as the release version.

| Change Type                               | Bump      | Examples                                                                                                                     |
| ----------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Breaking API change in any package        | **MAJOR** | Response-shape change in MCP tool; removed CLI flag; renamed exported symbol; changed function signature; removed npm export |
| Backwards-compatible feature              | **MINOR** | New CLI subcommand; new MCP tool; new client method; new optional config key; new exported error class                       |
| Backwards-compatible fix                  | **PATCH** | Bug fix; performance improvement; redaction fix; documentation correction                                                    |
| Security fix that is backwards-compatible | **PATCH** | Sensitive-field redaction; CVE patch; supply-chain dependency update                                                         |

**Pre-1.0 packages** (`0.x.y`): per [semver §4](https://semver.org/#spec-item-4), breaking changes can land in MINOR bumps. After v1.0.0, each package commits to standard semver and breaking changes require MAJOR.

**Coordination rule**: Because all four packages share a version, the release version is `max(per-package-implied-bump)`. The CHANGELOG entry must name the package(s) driving the bump so consumers understand the blast radius.

### Worked Example: SCA Continuation Release (post-v1.0.0)

The SCA continuation initiative introduces a **breaking change in `@qontoctl/mcp`**: the response shape of HTTP 428 SCA-required paths across the eight MCP write-tool families (`transfer_*`, `intl_transfer_*`, `internal_transfer_*`, `bulk_transfer_*`, `recurring_transfer_*`, `card_*`, `beneficiary_*`, `request_*`) changed (see PR #428 — `(feat) wire SCA continuation into MCP write tools`). Per the framework above:

| Package               | Implied bump | Why                                                                                                           |
| --------------------- | ------------ | ------------------------------------------------------------------------------------------------------------- |
| `@qontoctl/mcp`       | **MAJOR**    | Response-shape change — callers parsing the legacy text format break                                          |
| `@qontoctl/core`      | **MINOR**    | Additive: `scaMethod` exposure (#447); new typed errors (#445, #448); assorted fixes (#429, #430, #444, #446) |
| `@qontoctl/cli`       | **MINOR**    | Additive: new `sca-session` subcommands (#431); `--sca-method` flag (#447)                                    |
| `qontoctl` (umbrella) | **MAJOR**    | Inherits highest impact (`@qontoctl/mcp`)                                                                     |

→ **Release version: `2.0.0`** (post-v1.0.0).

## Release Procedure

### 1. Pre-release checks (local)

```sh
# On main, with no uncommitted changes
git checkout main
git pull --ff-only origin main
pnpm install --frozen-lockfile
pnpm build
pnpm typecheck
pnpm test
pnpm test:e2e          # required per CLAUDE.md § E2E Testing
pnpm lint
pnpm license-check
pnpm publish-check
pnpm format:check
```

All checks must pass green locally before tagging. The release workflow re-runs the same checks across ubuntu/macos/windows in CI (see step 4 below).

### 1.5. Verify umbrella bundle integrity (local)

Before promoting `[Unreleased]` to a versioned heading, verify the umbrella tarball still bundles its full dependency closure. This is the manual backstop for the CI guard described in [§ Why the umbrella is self-contained](#why-the-umbrella-is-self-contained); the CI guard catches the same regression at workflow-time, but running it locally first surfaces problems before tagging.

The recipe mirrors what `.github/workflows/release.yml` does in CI: `pnpm deploy` with hoisted linker materializes a self-contained tree under `.tmp/qontoctl-deploy/`, `pnpm pack` from there produces a tarball with `node_modules/` included (driven by the umbrella's `bundleDependencies` field).

```sh
rm -rf .tmp/qontoctl-deploy
NPM_CONFIG_NODE_LINKER=hoisted pnpm deploy --filter=./packages/qontoctl --prod .tmp/qontoctl-deploy
echo "node-linker=hoisted" > .tmp/qontoctl-deploy/.npmrc

(cd .tmp/qontoctl-deploy && pnpm pack)
tarball=$(ls .tmp/qontoctl-deploy/qontoctl-*.tgz | head -1)

# Verify full closure — any missing dep would trigger ETARGET under
# Homebrew's --min-release-age=1 filter
for dep in @qontoctl/cli @qontoctl/mcp @qontoctl/core commander yaml @clack/prompts @modelcontextprotocol/sdk zod proper-lockfile; do
  if ! tar tzf "$tarball" | grep -q "^package/node_modules/${dep}/package.json$"; then
    echo "ERROR: umbrella tarball is missing bundled ${dep}"
    exit 1
  fi
done
echo "✓ Umbrella tarball bundles full dependency closure"

# Smoke test: global install must succeed even under strict age filtering
npm install -g "$tarball" --min-release-age=999
qontoctl --version
```

The smoke-test step simulates the Homebrew install path under the strictest possible age filter; if it passes here it will pass under `--min-release-age=1` against the live registry too.

If verification fails, the most likely causes are: (a) `bundleDependencies` having been removed from `packages/qontoctl/package.json` (so pnpm pack excludes `node_modules/` entirely); (b) the `NPM_CONFIG_NODE_LINKER=hoisted` env var was dropped from the deploy step, leaving symlinked `node_modules/.pnpm/` that pack cannot include; (c) a new transitive dep was added to `@qontoctl/cli`, `@qontoctl/mcp`, or `@qontoctl/core` but the CI guard's enumeration in `.github/workflows/release.yml` was not updated to verify it. Inspect `tar tzf "$tarball" | grep node_modules | awk -F/ '{print $3}' | sort -u` to see what is actually bundled.

### 1.6. Run the contract probe (local)

Run the schema-vs-runtime contract probe to catch any Zod schema drift before tagging. This is the safety net against shipping a release where one or more `@qontoctl/core` schemas reject responses the live Qonto API actually returns (the failure mode that motivated #601, #604, #514, #496, etc., where each schema-strictness fix landed reactively after a user hit `Invalid API response`).

```sh
pnpm contract-probe
```

The probe loads OAuth credentials from the resolved config file (per CLAUDE.md § Configuration), calls every GET endpoint listed in `scripts/contract-probe.endpoints.json`, diffs each response against the named Zod schema exported from `@qontoctl/core`, and writes a `SchemaDriftReport[]` to `.tmp/contract-probe/{ISO8601}.json` plus a console summary table. The script is read-only by construction (GET-only endpoint catalog; never auto-edits schemas) — it surfaces drift as **suggested** corrective Zod declarations the maintainer reviews and applies manually.

**Exit codes**:

| Code | Meaning                                                      | Action                                                                                                                                                                                                                                                                                                              |
| ---- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `0`  | No drift detected — every probed endpoint matches its schema | Proceed to § 2                                                                                                                                                                                                                                                                                                      |
| `1`  | Drift detected on one or more endpoints                      | Open the JSON report at `.tmp/contract-probe/{ISO8601}.json`, decide per finding whether to relax the schema (additive `*.nullable().optional()` change) or to investigate as a real API contract change. Suggested fixes are emitted next to each finding; apply them in a follow-up PR before tagging the release |
| `2`  | OAuth credentials expired or missing                         | Re-authenticate (`qontoctl auth login` or refresh the file at the resolved config path) and re-run                                                                                                                                                                                                                  |
| `3`  | Config / network / schema-shape error                        | See the error message; the probe fails fast on misconfiguration                                                                                                                                                                                                                                                     |

**Why this matters at release time**: every prior schema-strictness incident was found by a user hitting a live response the schema rejected. Running the probe pre-release converts that reactive loop into a proactive check — discovered drift becomes a one-line schema relaxation in the same release rather than a hotfix the week after.

**Cadence**: at minimum, **before every release** (this step). The maintainer SHOULD also run the probe **quarterly** out-of-band even when no release is imminent — Qonto API responses can drift between releases, and a quarterly cadence keeps the drift surface bounded. There is no automated quarterly trigger today; the contract probe is intentionally local-only per `docs/designs/e2e-test-reliability.md §8.1` (CI runs api-key only, so it cannot exercise the OAuth-required endpoints in the catalog).

**Expanding the catalog**: if a new GET endpoint ships in `@qontoctl/core`, add an entry to `scripts/contract-probe.endpoints.json` with the schema name, response path, and an optional `query` map (some endpoints reject `per_page`). The catalog is the only thing the probe consults — adding code does not auto-enroll an endpoint into the probe surface.

### 2. Update CHANGELOG

Promote `[Unreleased]` to a versioned heading and start a fresh empty `[Unreleased]`:

```diff
 ## [Unreleased]

+## [2.0.0] — 2026-MM-DD
+
 ### Added
 ...
```

Move the date to the same line as the heading; preserve the `### Added` / `### Changed` / `### Fixed` / `### Security` subsections under the new versioned heading.

Verify each entry references a merged PR or issue. Confirm the per-package grouping convention (`**\`@qontoctl/<pkg>\`\*\*: ...`) is applied consistently.

Also bump `server.json` (`version` AND `packages[0].version`) to the same release version — the MCP Registry uses an explicit per-submission version (see § 4.5 below). `smithery.yaml` is unpinned (resolves `npx -y qontoctl` to `latest`) and does NOT need editing.

Commit on `main`:

```sh
git add CHANGELOG.md server.json
git commit -m "(docs) promote [Unreleased] to [2.0.0]"
git push origin main
```

### 3. Create GitHub Release

Tag and release from the `main` branch HEAD:

```sh
gh release create v2.0.0 \
  --repo alexey-pelykh/qontoctl \
  --title "v2.0.0" \
  --target main \
  --notes "$(awk '/^## \[2\.0\.0\]/{flag=1; next} /^## \[/{flag=0} flag' CHANGELOG.md)"
```

The tag MUST match the regex `^v[0-9]+\.[0-9]+\.[0-9]+(-[a-zA-Z0-9.-]+)?$` — see `.github/workflows/release.yml` § "Stamp version" step. Build metadata (e.g. `+build`) is rejected.

For a pre-release (alpha/beta/rc), append a hyphenated suffix and pass `--prerelease`:

```sh
gh release create v2.0.0-rc.1 \
  --repo alexey-pelykh/qontoctl \
  --title "v2.0.0-rc.1" \
  --target main \
  --prerelease \
  --notes "Pre-release for v2.0.0 — see CHANGELOG [Unreleased]."
```

### 4. npm publish (automatic)

Publishing the GitHub Release triggers the [`Release` workflow](../.github/workflows/release.yml):

1. **Validate** job runs `pnpm format:check && pnpm build && pnpm typecheck && pnpm lint && pnpm license-check && pnpm publish-check && pnpm test` on ubuntu/macos/windows (3-OS matrix) at version `0.0.0` (the workspace baseline). Note: the validate job intentionally tests at `0.0.0` (see workflow comment); for TypeScript projects, version rarely affects build output.
2. **Publish to npm** job (gated by GitHub Environment `npm-publish`, restricted to `main` and `v*` tags):
    - Stamps the version from the tag: `pnpm -r exec npm version "$VERSION" --no-git-tag-version --allow-same-version`.
    - Builds.
    - Dry-runs `pnpm -r publish` to verify packaging.
    - Publishes with provenance via npm trusted publishing (OIDC, no static `NPM_TOKEN`).

Watch the run:

```sh
gh run list --repo alexey-pelykh/qontoctl --workflow Release --limit 1
gh run watch <run-id> --repo alexey-pelykh/qontoctl
```

If the run fails before publish, investigate, push a fix to `main`, delete the failed release+tag, and re-cut. If it fails mid-publish (some packages published, others not), **do not unpublish** (npm forbids re-publishing the same version after unpublish). Cut a patch release with the missing packages instead — see § Rollback.

### 4.5. Update MCP Registry & Smithery (manual)

QontoCtl's MCP server is listed in two additional distribution channels beyond npm + Homebrew. Their pre-release coordination differs:

**Smithery** (`smithery.yaml`): Uses `npx -y qontoctl mcp` (no version pin). After npm publish completes, the Smithery channel automatically resolves to `latest` on the next user installation — no per-release action needed.

**MCP Registry** (`server.json`): The MCP Registry uses an explicit `version` per submission. Before tagging:

1. Confirm `server.json` `version` and `packages[0].version` both reflect the version being released (these are stamped manually as part of the CHANGELOG-promotion commit in § 2 above — verify they match the tag about to be cut).
2. After npm publish completes, re-submit `server.json` to the MCP Registry using the credentials stored at `.mcpregistry_github_token` and `.mcpregistry_registry_token` (gitignored). The submission API/CLI is the official MCP Registry's. If this is the first time submitting after a registry-token rotation, refresh the token first.
3. Verify by querying the MCP Registry for `io.github.alexey-pelykh/qontoctl` and confirming the live `version` matches.

If the MCP Registry submission step is forgotten, the registry will keep advertising the previous version even though npm has the new one. There is no automation for this today — consider folding the `server.json` stamp + re-submit into `.github/workflows/release.yml` as a follow-up enhancement.

### 5. Update Homebrew tap (manual trigger)

After npm publish completes, trigger the Homebrew formula update workflow in the [`qontoctl/homebrew-tap`](https://github.com/qontoctl/homebrew-tap) repository:

```sh
gh workflow run "Update Formula" --repo qontoctl/homebrew-tap
```

This workflow reads the latest `qontoctl` version from the npm registry, regenerates the Homebrew formula with the new version + sha256, and commits to `main` of `homebrew-tap`. Verify:

```sh
gh run list --repo qontoctl/homebrew-tap --workflow "Update Formula" --limit 1
gh run watch <run-id> --repo qontoctl/homebrew-tap
```

After the workflow succeeds, end-users can install or upgrade via:

```sh
brew install qontoctl/tap/qontoctl       # fresh install
brew upgrade qontoctl/tap/qontoctl       # existing install
```

### 6. Post-release verification

```sh
# npm packages live at the new version
npm view qontoctl version
npm view @qontoctl/core version
npm view @qontoctl/cli version
npm view @qontoctl/mcp version

# Homebrew formula updated
brew info qontoctl/tap/qontoctl
```

All five should report the new version.

### 7. Announce (optional)

- **GitHub Release notes** — already populated in step 3.
- **Linked GitHub Issues** — comment closing each issue with the release version (e.g., `Released in v2.0.0`).
- **Discussions / Slack / etc.** — at maintainer discretion.

## Rollback

npm publishes are **immutable** — the same version cannot be re-published after unpublish. Use `npm deprecate` for soft rollback, then ship a patch release with the fix:

```sh
# Mark the bad version deprecated (does not remove it)
npm deprecate qontoctl@2.0.0          "Critical regression — please use 2.0.1 or downgrade to 1.x"
npm deprecate @qontoctl/core@2.0.0    "Critical regression — please use 2.0.1 or downgrade to 1.x"
npm deprecate @qontoctl/cli@2.0.0     "Critical regression — please use 2.0.1 or downgrade to 1.x"
npm deprecate @qontoctl/mcp@2.0.0     "Critical regression — please use 2.0.1 or downgrade to 1.x"

# Cut the patch
git checkout main && git pull --ff-only origin main
# ...fix, commit, push, then re-run § 1–5 above with v2.0.1
```

For Homebrew, after the patch is published on npm, re-run the `Update Formula` workflow to point users at the patched version:

```sh
gh workflow run "Update Formula" --repo qontoctl/homebrew-tap
```

## Troubleshooting

| Symptom                                             | Likely cause                                                                       | Fix                                                                                                                                                |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Tag is not a valid semver version" in workflow log | Tag missing `v` prefix or contains `+build` metadata                               | Re-tag with `vMAJOR.MINOR.PATCH` (optional `-prerelease` suffix)                                                                                   |
| `pnpm publish` "version already exists"             | Stamping replayed an already-published version                                     | Bump and re-tag; npm forbids overwriting                                                                                                           |
| Validate job passes but publish fails on one OS     | Likely a transient registry / OIDC issue                                           | Re-run the failed job from the workflow page; do not re-tag                                                                                        |
| Homebrew formula points at old version              | "Update Formula" workflow did not run, ran on a non-`main` branch, or failed       | Re-run `gh workflow run "Update Formula" --repo qontoctl/homebrew-tap`; check the run log                                                          |
| Validate job concern about `0.0.0`                  | Validate runs at workspace baseline `0.0.0`, not the release version               | Accepted trade-off documented in the workflow file. If version-dependent behavior is introduced into the pipeline, move stamping before validation |
| `pnpm publish-check` fails                          | A `package.json` field (homepage, repository, license, etc.) is missing or invalid | See `scripts/check-publish-manifest.js` for the enforced fields                                                                                    |
| `pnpm license-check` fails                          | A new dependency uses a non-allowed license                                        | See `scripts/check-licenses.js` for allowed list; pin/replace the dependency                                                                       |

## Why the umbrella is self-contained

The umbrella `qontoctl` package publishes from a `pnpm deploy` materialized tree with full transitive `node_modules/` baked into the tarball. The mechanism has three load-bearing parts:

1. **`bundleDependencies` flag.** [`packages/qontoctl/package.json`](../packages/qontoctl/package.json) declares `bundleDependencies: ["@qontoctl/cli", "@qontoctl/mcp"]`. This is npm's signal that `node_modules/` should be included in the tarball when packing. Without this field, `pnpm pack` and `npm pack` exclude `node_modules/` entirely regardless of what's on disk.

2. **`pnpm deploy` with hoisted linker.** pnpm's default `node-linker=isolated` produces symlinked `node_modules/` (with `.pnpm/` virtual store), which `pnpm pack` refuses to bundle (it errors with `ERR_PNPM_BUNDLED_DEPENDENCIES_WITHOUT_HOISTED`, and even if it didn't, the symlinks point to paths that won't exist on install). The release workflow runs `pnpm deploy --filter=./packages/qontoctl --prod .tmp/qontoctl-deploy` with `NPM_CONFIG_NODE_LINKER=hoisted` so the deploy target gets real materialized directories for every dep in the closure.

3. **Pack from the deploy target, not the workspace.** A local `.npmrc` (`node-linker=hoisted`) inside `.tmp/qontoctl-deploy/` lets `pnpm pack` read the materialized tree directly. The resulting tarball self-contains `@qontoctl/{cli,mcp,core}` plus every 3rd-party transitive (`commander`, `yaml`, `@clack/prompts`, `@modelcontextprotocol/sdk`, `zod`, `proper-lockfile`, and their own transitives — ~106 packages total). At install time `npm install` finds everything locally and never queries the registry.

**Why this matters for Homebrew.** Homebrew's `std_npm_args` injects `--min-release-age=1` (day) into the `npm install` step of `Formula/qontoctl.rb` as a post-axios-compromise supply-chain hardening default. Without bundling, the umbrella's `^2.0.0` registry deps would fail the age filter for ~24 hours after every release, because `pnpm -r publish` ships all four `@qontoctl/*` packages within ~11 seconds of each other (all topologically — `core` → `cli`/`mcp` → `qontoctl`). The bundled subtree sidesteps registry resolution entirely, so `--min-release-age` has nothing to filter on and the brew install succeeds within minutes of the npm publish.

This was a v2.0.0 regression (`brew install qontoctl/tap/qontoctl` failed with `ETARGET` for ~24h) — see [#597](https://github.com/alexey-pelykh/qontoctl/issues/597) and the v2.0.1 CHANGELOG entry. npm does not yet provide an exclusion mechanism for `--min-release-age` ([npm/cli#8994](https://github.com/npm/cli/issues/8994)); the deploy-target bundling approach is the npm-native functional equivalent.

**Why not a single esbuild bundle?** Considered and rejected during /council (2026-05-15). The codebase pervasively uses `createRequire(import.meta.url) + require("../package.json")` (in `program.ts`, `diagnose.ts`, `http-client.ts`, `server.ts`) and `import.meta.url`-based asset loading (`auth.ts` loads `logo.png`). esbuild would silently break all of these — `--version`, `qontoctl diagnose`, and the OAuth UX would report wrong values or fail. The deploy-target approach preserves the runtime module-resolution semantics of a regular `npm install`.

**Publish topology.** The release workflow publishes in two phases: (1) `pnpm -r publish --filter='!qontoctl' --provenance` ships `@qontoctl/{core,cli,mcp}` from the workspace; (2) `pnpm publish --provenance` from `.tmp/qontoctl-deploy/` ships the umbrella from the materialized tree. Both phases attest provenance via the same OIDC token; the umbrella's tarball-content provenance covers the embedded `node_modules/` subtree.

**CI guard.** [`.github/workflows/release.yml`](../.github/workflows/release.yml) `publish-npm` job packs the deploy target and inspects the tarball for the full closure (`@qontoctl/{cli,mcp,core}` + every direct 3rd-party dep) before publishing. If anyone removes `bundleDependencies`, drops the `NPM_CONFIG_NODE_LINKER=hoisted` env var, or adds a new transitive dep that isn't covered, the release fails with a `::error::` annotation pointing at the missing dep — the regression cannot ship silently. See [#599](https://github.com/alexey-pelykh/qontoctl/issues/599).

**Manual backstop.** § 1.5 above documents the same verification commands for local execution before tagging. Run them at minimum when modifying `packages/qontoctl/package.json`, the release workflow, or any direct dep of `@qontoctl/cli`/`@qontoctl/mcp`/`@qontoctl/core`.

**Trade-off.** The umbrella tarball is now larger than a thin shim (~4-5MB with bundled transitives). This is the accepted cost of install reliability; the tarball is still single-digit MB.

## References

- [`CLAUDE.md`](../CLAUDE.md) § CI/CD — high-level pipeline summary.
- [`.github/workflows/release.yml`](../.github/workflows/release.yml) — release workflow definition.
- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — pre-release CI gate.
- [`scripts/check-licenses.js`](../scripts/check-licenses.js) — dependency license allowlist.
- [`scripts/check-publish-manifest.js`](../scripts/check-publish-manifest.js) — package manifest validation.
- [Semantic Versioning 2.0.0](https://semver.org/) — versioning rules.
- [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) — CHANGELOG conventions.
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers) — OIDC-based publish flow.
