# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

The next release is a coordinated bump across all four packages — `@qontoctl/core`, `@qontoctl/cli`, `@qontoctl/mcp`, and `qontoctl` (umbrella). **`@qontoctl/mcp` introduces a BREAKING change in the SCA response shape** for the eight write tools (see § Changed); **`qontoctl` (umbrella) inherits MAJOR**. See [`docs/release-runbook.md`](docs/release-runbook.md) for the full semver decision framework and worked example.

### Added

- **`@qontoctl/cli`**: `sca-session show <token>` subcommand to inspect SCA session status (#431).
- **`@qontoctl/cli`**: `sca-session mock-decision <token> <allow|deny>` subcommand for sandbox-only SCA decision injection (#431).
- **`@qontoctl/mcp`**: `sca_session_show` MCP tool to inspect SCA session status (#432).
- **`@qontoctl/mcp`**: `sca_session_mock_decision` MCP tool for sandbox-only SCA decision injection (gated to sandbox mode) (#432).
- **`@qontoctl/mcp`**: `executeWithMcpSca` wrapper module enabling bounded SCA polling (`wait` knob) and two-step `sca_session_token` continuation across MCP write tools (#433).
- **`@qontoctl/core`** + **`@qontoctl/cli`** + **`@qontoctl/mcp`**: `scaMethod` / `X-Qonto-2fa-Preference` exposure through `createClient`, the hidden `--sca-method` CLI flag, and MCP server config. Auto-defaults to `mock` when a sandbox staging token is present and no method is otherwise set; production never auto-defaults. The MCP server resolves the method from env/config only — it is intentionally not exposed as a tool input (#447).
- **Docs**: PSD2 Article 5 SCA token request-binding verification recorded in `docs/security/sca-token-binding.md` (#438).
- **Docs**: Release runbook (`docs/release-runbook.md`) covering semver decision framework, npm publish flow, and Homebrew tap update (#435).

### Changed

- **`@qontoctl/mcp`** **(BREAKING)**: SCA-required (HTTP 428) responses across the eight MCP write-tool families (`transfer_*`, `intl_transfer_*`, `internal_transfer_*`, `bulk_transfer_*`, `recurring_transfer_*`, `card_*`, `beneficiary_*`, `request_*` — every operation that triggers SCA) no longer return the legacy dead-end text response. Tools now accept optional `wait` (number 0–120, or `false`) and `sca_session_token` input parameters and return a structured SCA-pending response on poll-timeout that references the new `sca_session_show` and `sca_session_mock_decision` tools. Callers parsing the previous text response must adapt to the new shape (#428).

### Fixed

- **`@qontoctl/core`**: SCA-retry idempotency-key drift in `executeWithSca` — both the original 428 attempt and the SCA-approved retry now carry the same `X-Qonto-Idempotency-Key` header. Without this fix, retries without an explicit `--idempotency-key` could create duplicate operations (#429).
- **`@qontoctl/core`**: `mockScaDecision` URL corrected and request body removed to match the Qonto sandbox API (#446).
- **`@qontoctl/core`**: `build428Error` now throws a typed error on unknown 428 response shape, surfacing clearer diagnostics instead of silently falling through (#445).
- **`@qontoctl/core`**: 428 responses with `code: "sca_not_enrolled"` are now distinguished from `code: "sca_required"` and surface a typed `ScaNotEnrolledError`, allowing callers to react differently (#448).
- **`@qontoctl/core`**: Beneficiary `trust`/`untrust` operations now use `PATCH` (was incorrectly using `POST`) (#444).

### Security

- **`@qontoctl/core`**: SCA session token redacted from error messages and debug logs. `QontoScaRequiredError`, `ScaTimeoutError`, and `ScaDeniedError` no longer embed the token in their `.message` strings (token remains accessible via the dedicated `.scaSessionToken` field). The `sca_session_token` request-body field and `X-Qonto-Sca-Session-Token` header are added to `redactSensitiveFields` (#430).

## [1.0.0] — 2026-03-26

### Added

- OAuth 2.0 authentication flow with PKCE, token management, and automatic refresh
- SCA (Strong Customer Authentication) handling infrastructure for write operations
- Idempotency key management for write operations
- OAuth app setup guide (`docs/oauth-setup.md`)
- Account management commands: `account create`, `account update`, `account close`, `account iban-certificate`
- SEPA beneficiary commands: `beneficiary list`, `beneficiary show`, `beneficiary add`, `beneficiary update`, `beneficiary trust`, `beneficiary untrust`
- SEPA transfer commands: `transfer list`, `transfer show`, `transfer create`, `transfer cancel`, `transfer proof`, `transfer verify-payee`, `transfer bulk-verify-payee`
- Internal transfer command: `internal-transfer create`
- Bulk transfer commands: `bulk-transfer list`, `bulk-transfer show`
- Recurring transfer commands: `recurring-transfer list`, `recurring-transfer show`
- Client management commands: `client list`, `client show`, `client create`, `client update`, `client delete`
- Client invoice commands: `client-invoice list`, `client-invoice show`, `client-invoice create`, `client-invoice update`, `client-invoice delete`, `client-invoice finalize`, `client-invoice send`, `client-invoice mark-paid`, `client-invoice unmark-paid`, `client-invoice cancel`, `client-invoice upload`, `client-invoice upload-show`
- Quote commands: `quote list`, `quote show`, `quote create`, `quote update`, `quote delete`, `quote send`
- Credit note commands: `credit-note list`, `credit-note show`
- Supplier invoice commands: `supplier-invoice list`, `supplier-invoice show`, `supplier-invoice bulk-create`
- E-invoicing command: `einvoicing settings`
- Request command: `request list`
- Attachment commands: `attachment upload`, `attachment show`
- Transaction attachment commands: `transaction attachment list`, `transaction attachment add`, `transaction attachment remove`
- Membership management commands: `membership show`, `membership invite`
- Corresponding MCP tools for all new CLI commands (69 tools total)
- MCP registry configuration files
- Social preview banner for README

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
- `@qontoctl/cli` package with CLI command definitions
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
