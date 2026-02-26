# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

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
