# QontoCtl — Claude Instructions

> Development guidelines for AI-assisted development of QontoCtl

## Project Overview

**QontoCtl** is a CLI and MCP server for the [Qonto](https://qonto.com) banking API, published as `qontoctl` on npm.

- **License**: AGPL-3.0-only
- **Runtime**: Node.js >= 24, ESM only
- **Language**: TypeScript (strict mode, ES2024 target, NodeNext modules)

## Repository Structure

```
qontoctl/
  packages/
    core/       → @qontoctl/core  (Qonto API client, auth, services)
    cli/        → @qontoctl/cli   (CLI commands, program definition)
    mcp/        → @qontoctl/mcp   (MCP server)
    qontoctl/   → qontoctl        (umbrella: CLI + MCP compose)
    e2e/        → @qontoctl/e2e   (private, E2E tests)
  scripts/
    check-licenses.js             (SPDX license compliance)
```

## Package Dependency Graph

```
core ← cli ← qontoctl (umbrella)
core ← mcp ←┘
core ← cli ← e2e (private, all packages)
core ← mcp ←┘
```

- `core` has no internal dependencies (leaf package)
- `cli` and `mcp` depend on `core`
- `qontoctl` (umbrella) composes `cli` + `mcp`
- `e2e` depends on all publishable packages

## Development Commands

```sh
pnpm install          # Install dependencies
pnpm build            # Build all packages (via Turbo)
pnpm test             # Run unit tests
pnpm test:e2e         # Run E2E tests (sequential)
pnpm lint             # Lint all packages
pnpm license-check    # Verify dependency licenses
pnpm dev              # Watch mode
```

## Conventions

### Source Files

Every `.ts` and `.js` file MUST start with:

```ts
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH
```

ESLint enforces this via `eslint-plugin-header`.

### Commit Messages

- Format: `(type) lowercase message` — e.g. `(feat) add transaction sync`
- Types: `feat`, `fix`, `chore`, `docs`, `ci`, `refactor`, `test`
- Reference issues: `(fix) resolve transaction sync (#12)`
- One logical change per commit

### Formatting

- Prettier with default configuration (no overrides)
- EditorConfig: 2-space indent for `.ts`, `.js`, `.json`, `.yaml`/`.yml`; LF line endings; UTF-8
- Max line length: 120 (EditorConfig)

### Dependencies

- Production dependencies must have licenses compatible with AGPL-3.0-only
- Allowed licenses: MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, 0BSD, BlueOak-1.0.0, Unlicense, CC0-1.0, CC-BY-3.0, CC-BY-4.0 (see `scripts/check-licenses.js`)
- Use `workspace:^` for inter-package dependencies
- Use `catalog:` references in `pnpm-workspace.yaml` for shared version management
- Pin GitHub Actions to commit SHAs with version comments (e.g., `# v6.0.2`)

### Testing

- Unit tests: `*.test.ts` (co-located with source)
- E2E tests: `*.e2e.test.ts` (require Qonto sandbox)
- Coverage thresholds: statements 85%, branches 69%, functions 80%, lines 85%

### E2E Testing

**When to run:** After implementing or modifying code that touches Qonto API interactions, CLI commands, MCP tools, or any behavior covered by E2E tests — run E2E tests locally to validate before completing the task.

**Credentials:** The repo contains `.qontoctl.yaml` (gitignored) with API key credentials. The config resolver picks this up from CWD automatically — no env var overrides needed.

**Sandbox note:** The Qonto sandbox environment (`thirdparty-sandbox.staging.qonto.co`) is only for OAuth-based integrations. API key authentication uses the production endpoint (`thirdparty.qonto.com`) directly — there is no separate sandbox for API key auth. E2E tests run against production.

**Running:**

```sh
pnpm test:e2e                       # Full E2E suite
```

- Turbo builds all packages before running tests (declared dependency)
- Tests run sequentially (`--concurrency=1`) to avoid API race conditions
- Per-test timeout: 30 seconds

**What's covered:** organization/account listing, transactions (filtering, pagination), bank statements, labels (CRUD), memberships, MCP server initialization, and MCP tool invocations.

### TypeScript

- Strict mode with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`
- Use `verbatimModuleSyntax` (explicit `type` imports)
- All packages use `composite: true` with project references
- ESLint uses `tseslint.configs.strictTypeChecked` (strict type-aware rules)

### Package Exports

Each package uses conditional exports with `types` + `import`:

```json
"exports": {
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  }
}
```

### Local Files

- `*.local.*` pattern is gitignored for developer-local configuration
- `.mcp.json.local` for local MCP credentials

## CI/CD

- **CI**: Runs on push/PR to `main`; 3-OS matrix (ubuntu, macos, windows); builds, lints, license-checks, tests
- **Release**: Triggered by GitHub Release publish; validates, stamps version from git tag, publishes to npm with provenance
- **Setup**: Composite action at `.github/actions/setup/` (pnpm + Node.js 24 + frozen lockfile + Turbo cache)
- Coverage uploaded to Codecov on ubuntu only
