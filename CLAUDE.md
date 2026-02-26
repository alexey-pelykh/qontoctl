# QontoCtl — Claude Instructions

> Development guidelines for AI-assisted development of QontoCtl

## Project Overview

**QontoCtl** is a CLI and MCP server for the [Qonto](https://qonto.com) banking API, published as `@qontoctl/cli` on npm.

- **License**: AGPL-3.0-only
- **Runtime**: Node.js >= 24, ESM only
- **Language**: TypeScript (strict mode, ES2024 target, NodeNext modules)

## Repository Structure

```
qontoctl/
  packages/
    core/       → @qontoctl/core  (Qonto API client, auth, services)
    mcp/        → @qontoctl/mcp   (MCP server)
    qontoctl/   → @qontoctl/cli   (umbrella: CLI + MCP compose)
    e2e/        → @qontoctl/e2e   (private, E2E tests)
  scripts/
    check-licenses.js             (SPDX license compliance)
```

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

- Imperative mood: "Add feature" not "Added feature"
- Reference issues: `Fix transaction sync (#12)`
- One logical change per commit

### Dependencies

- Production dependencies must have licenses compatible with AGPL-3.0-only
- Use `catalog:` references in `pnpm-workspace.yaml` for version management
- Pin GitHub Actions to commit SHAs

### Testing

- Unit tests: `*.test.ts` (co-located with source)
- E2E tests: `*.e2e.test.ts` (require Qonto sandbox)
- Coverage thresholds: statements 85%, branches 69%, functions 80%, lines 85%

### TypeScript

- Strict mode with `exactOptionalPropertyTypes` and `noUncheckedIndexedAccess`
- Use `verbatimModuleSyntax` (explicit `type` imports)
- All packages use `composite: true` with project references
