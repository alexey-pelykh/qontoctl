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

Commit on `main`:

```sh
git add CHANGELOG.md
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

## References

- [`CLAUDE.md`](../CLAUDE.md) § CI/CD — high-level pipeline summary.
- [`.github/workflows/release.yml`](../.github/workflows/release.yml) — release workflow definition.
- [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) — pre-release CI gate.
- [`scripts/check-licenses.js`](../scripts/check-licenses.js) — dependency license allowlist.
- [`scripts/check-publish-manifest.js`](../scripts/check-publish-manifest.js) — package manifest validation.
- [Semantic Versioning 2.0.0](https://semver.org/) — versioning rules.
- [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) — CHANGELOG conventions.
- [npm trusted publishing](https://docs.npmjs.com/trusted-publishers) — OIDC-based publish flow.
