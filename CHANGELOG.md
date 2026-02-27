# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.1.0] — 2026-02-27

### Added

- Organization and bank accounts commands (`org show`, `account list`, `account show`)
- Transaction commands with filtering and pagination (`transaction list`, `transaction show`)
    - Filter by bank account, status, side, operation type, date range, and attachments
    - Customizable sort order and nested resource inclusion (labels, attachments, vat_details)
    - Auto-resolve to main bank account when no account specified
- Bank statement commands (`statement list`, `statement show`, `statement download`)
- Labels management commands (`label list`, `label show`)
- Membership listing command (`membership list`)
- Profile management for multi-organization support (`profile add`, `profile list`, `profile show`, `profile remove`, `profile test`)
    - Named profiles stored in `~/.qontoctl/` with restrictive file permissions
    - Configuration resolution from environment variables, CWD file, named profiles, and home directory
- Shell completion generation for bash, zsh, and fish
- Four output formats: table (default), json, yaml, csv
- Global CLI error handler with user-friendly error messages
- Debug mode with sensitive field redaction in logs
- Full API field output for json/yaml formats in label and membership commands
- MCP server with stdio transport and 10 tools:
  `org_show`, `account_list`, `account_show`, `transaction_list`, `transaction_show`,
  `statement_list`, `statement_show`, `label_list`, `label_show`, `membership_list`
- Standalone MCP server entry point (`qontoctl mcp`)
- HTTP client foundation with typed error handling
- API key authentication module
- URL parameter encoding for all API path parameters
- Comprehensive test suites: unit tests with coverage thresholds, E2E tests for CLI and MCP
- Strict TypeScript configuration with `strictTypeChecked` ESLint rules
- README for each publishable package
- MCP integration guide and tool documentation
- AGPL license FAQ in project README
- PR template and Code of Conduct

### Fixed

- Restrictive file permissions on credential configuration files
- `@types/node` version aligned with Node.js runtime requirement
- MCP standalone entry point uses resolved endpoint configuration
- Topological publish order in release workflow
- Unsafe type assertions removed from HTTP client
- Dead MCP tool files removed; `withClient` error handling added
- Test files excluded from published dist/ builds
- LICENSE file included in all published npm packages
- `publishConfig` added to scoped package.json files

### Changed

- Replaced `--sandbox` flag with endpoint/sandbox configuration
- Replaced `eslint-plugin-header` with maintained fork
- Version read from `package.json` at runtime instead of hardcoded

## [0.0.0] — 2026-02-26

### Added

- Monorepo scaffolding with pnpm workspace and Turbo build orchestration
- `@qontoctl/core` package for Qonto API client and service layer
- `@qontoctl/mcp` package with MCP server (stdio transport)
- `@qontoctl/cli` umbrella package with `qontoctl` CLI and `mcp` subcommand
- CI pipeline (GitHub Actions) with multi-platform testing
- Release pipeline with npm provenance attestation
- SPDX license headers on all source files
- ESLint rule to enforce SPDX license headers on new files
- Dependency license compatibility check in CI
- CODEOWNERS for security-sensitive files
- Issue templates for bug reports and feature requests
- Dependabot configuration for automated dependency updates
- CONTRIBUTING guide with development setup instructions
- Security documentation for credential handling and MCP trust model
