# @qontoctl/core

[![npm version](https://img.shields.io/npm/v/@qontoctl/core?logo=npm)](https://www.npmjs.com/package/@qontoctl/core)

Core library for [Qonto](https://qonto.com) API integration — HTTP client, authentication, configuration, and typed service functions.

Part of the [QontoCtl](https://github.com/alexey-pelykh/qontoctl) project.

## Installation

```sh
npm install @qontoctl/core
```

## Usage

```ts
import { resolveConfig, buildApiKeyAuthorization, HttpClient, getOrganization } from "@qontoctl/core";

// Resolve configuration from file or environment
const { config, endpoint } = await resolveConfig();

// Build authorization headers
const authorization = buildApiKeyAuthorization(config.apiKey);

// Create an HTTP client
const client = new HttpClient({ baseUrl: endpoint, authorization });

// Fetch organization details
const org = await getOrganization(client);
```

## API

### Configuration

- **`resolveConfig(options?): Promise<ConfigResult>`** — resolve credentials from config files and environment variables
- **`loadConfigFile(path)`** — load a YAML configuration file
- **`validateConfig(config)`** — validate configuration structure
- **`applyEnvOverlay(config, prefix?)`** — overlay environment variable overrides
- **`isValidProfileName(name)`** — check if a profile name is valid
- **`saveOAuthTokens(path, tokens)`** — save OAuth tokens to a config file
- **`saveOAuthClientCredentials(path, credentials)`** — save OAuth client credentials to a config file
- **`clearOAuthTokens(path)`** — remove OAuth tokens from a config file
- **`ConfigError`** — error thrown on configuration validation failures or missing credentials

### Authentication

- **`buildApiKeyAuthorization(credentials)`** — build authorization headers from API key credentials
- **`buildOAuthAuthorization(tokens)`** — build authorization headers from OAuth tokens
- **`generateCodeVerifier()`** — generate a PKCE code verifier
- **`generateCodeChallenge(verifier)`** — generate a PKCE code challenge from a verifier
- **`exchangeCode(params)`** — exchange an authorization code for tokens
- **`refreshAccessToken(params)`** — refresh an expired access token
- **`revokeToken(params)`** — revoke an OAuth token
- **`AuthError`** — error thrown when credentials are missing or invalid

### HTTP Client

- **`HttpClient`** — HTTP client for the Qonto API with rate-limit handling
- **`QontoApiError`** — typed error for Qonto API error responses
- **`QontoRateLimitError`** — error for rate-limit (HTTP 429) responses
- **`QontoScaRequiredError`** — error for SCA-required (HTTP 428) responses
- **`QontoScaNotEnrolledError`** — error for HTTP 428 with `code: "sca_not_enrolled"` (distinct from `sca_required`)

### SCA (Strong Customer Authentication)

- **`getScaSession(client, scaId)`** — retrieve an SCA session by ID
- **`pollScaSession(client, scaId, options?)`** — poll an SCA session until completion
- **`executeWithSca(client, operation, options?)`** — execute an API call with SCA handling. The `operation` callback receives an `ExecuteWithScaContext` carrying a stable `idempotencyKey` (shared across the initial 428 attempt and the post-SCA retry) and an optional `scaSessionToken` (set on retry); callers MUST forward `context.idempotencyKey` to the underlying request so both wire attempts emit the same `X-Qonto-Idempotency-Key`. Supply `options.idempotencyKey` to pin the value (e.g. when the user passes `--idempotency-key`); otherwise a UUID is generated once and reused.
- **`mockScaDecision(client, scaId, decision)`** — mock an SCA decision (sandbox only)
- **`ScaDeniedError`** — error when SCA is denied by the user
- **`ScaTimeoutError`** — error when SCA polling times out

### Constants

- **`API_BASE_URL`** — production API base URL (`https://thirdparty.qonto.com`)
- **`SANDBOX_BASE_URL`** — sandbox API base URL (`https://thirdparty-sandbox.staging.qonto.co`)
- **`CONFIG_DIR`** — default config directory path (`~/.qontoctl`)
- **`OAUTH_AUTH_URL`** / **`OAUTH_AUTH_SANDBOX_URL`** — OAuth authorization endpoints
- **`OAUTH_TOKEN_URL`** / **`OAUTH_TOKEN_SANDBOX_URL`** — OAuth token endpoints
- **`OAUTH_REVOKE_URL`** / **`OAUTH_REVOKE_SANDBOX_URL`** — OAuth revoke endpoints

### Services

- **`getOrganization(client)`** — fetch organization details
- **`getBankAccount(client, id)`** — fetch a bank account by ID
- **`createBankAccount(client, params)`** — create a new bank account
- **`updateBankAccount(client, id, params)`** — update a bank account
- **`closeBankAccount(client, id)`** — close a bank account
- **`getIbanCertificate(client, id)`** — download IBAN certificate PDF
- **`resolveDefaultBankAccount(client)`** — resolve the default bank account
- **`getTransaction(client, id)`** — fetch a transaction by ID
- **`buildTransactionQueryParams(params)`** — build query parameters for transaction listing
- **`getBeneficiary(client, id)`** — fetch a beneficiary by ID
- **`createBeneficiary(client, params)`** — create a SEPA beneficiary
- **`updateBeneficiary(client, id, params)`** — update a beneficiary
- **`trustBeneficiaries(client, ids)`** — trust beneficiaries
- **`untrustBeneficiaries(client, ids)`** — untrust beneficiaries
- **`buildBeneficiaryQueryParams(params)`** — build query parameters for beneficiary listing
- **`getTransfer(client, id)`** — fetch a transfer by ID
- **`createTransfer(client, params)`** — create a SEPA transfer
- **`cancelTransfer(client, id)`** — cancel a pending transfer
- **`getTransferProof(client, id)`** — download transfer proof PDF
- **`verifyPayee(client, params)`** — verify a payee (VoP)
- **`bulkVerifyPayee(client, entries)`** — bulk verify payees
- **`buildTransferQueryParams(params)`** — build query parameters for transfer listing
- **`createInternalTransfer(client, params)`** — create an internal transfer
- **`getBulkTransfer(client, id)`** — fetch a bulk transfer by ID
- **`getRecurringTransfer(client, id)`** — fetch a recurring transfer by ID
- **`getClientInvoice(client, id)`** — fetch a client invoice by ID
- **`createClientInvoice(client, params)`** — create a draft client invoice
- **`updateClientInvoice(client, id, params)`** — update a draft client invoice
- **`deleteClientInvoice(client, id)`** — delete a draft client invoice
- **`finalizeClientInvoice(client, id)`** — finalize a client invoice
- **`sendClientInvoice(client, id)`** — send a client invoice via email
- **`markClientInvoicePaid(client, id)`** — mark a client invoice as paid
- **`unmarkClientInvoicePaid(client, id)`** — unmark paid status
- **`cancelClientInvoice(client, id)`** — cancel a finalized client invoice
- **`uploadClientInvoiceFile(client, id, file)`** — upload a file to a client invoice
- **`getClientInvoiceUpload(client, id, uploadId)`** — get upload details
- **`buildClientInvoiceQueryParams(params)`** — build query parameters for client invoice listing
- **`getSupplierInvoice(client, id)`** — fetch a supplier invoice by ID
- **`bulkCreateSupplierInvoices(client, entries)`** — bulk create supplier invoices
- **`buildSupplierInvoiceQueryParams(params)`** — build query parameters for supplier invoice listing
- **`uploadAttachment(client, file)`** — upload an attachment
- **`getAttachment(client, id)`** — fetch attachment details
- **`listTransactionAttachments(client, transactionId)`** — list transaction attachments
- **`addTransactionAttachment(client, transactionId, attachmentId)`** — add attachment to transaction
- **`removeAllTransactionAttachments(client, transactionId)`** — remove all transaction attachments
- **`removeTransactionAttachment(client, transactionId, attachmentId)`** — remove specific attachment
- **`getEInvoicingSettings(client)`** — fetch e-invoicing settings

### Types

Configuration: `QontoctlConfig`, `ApiKeyCredentials`, `OAuthCredentials`, `ConfigResult`, `ResolveOptions`, `LoadResult`, `ValidationResult`, `TokenUpdate`

Auth: `OAuthTokens`, `Authorization`

HTTP: `HttpClientOptions`, `HttpClientLogger`, `QueryParams`, `QueryParamValue`, `QontoApiErrorEntry`

SCA: `ScaSession`, `ScaSessionStatus`, `ScaMethod`, `PollScaSessionOptions`, `ExecuteWithScaCallbacks`, `ExecuteWithScaOptions`

API: `Organization`, `BankAccount`, `PaginationMeta`, `Transaction`, `TransactionLabel`, `ListTransactionsParams`, `Statement`, `StatementFile`, `Label`, `Membership`

Beneficiaries: `Beneficiary`, `ListBeneficiariesParams`, `CreateBeneficiaryParams`, `UpdateBeneficiaryParams`

Transfers: `Transfer`, `ListTransfersParams`, `CreateTransferParams`, `VopEntry`, `VopResult`, `InternalTransfer`, `CreateInternalTransferParams`, `BulkTransfer`, `BulkTransferResult`, `BulkTransferResultError`, `RecurringTransfer`

Clients: `Client`, `ClientAddress`

Invoicing: `ClientInvoice`, `ClientInvoiceAmount`, `ClientInvoiceDiscount`, `ClientInvoiceItem`, `ClientInvoiceAddress`, `ClientInvoiceClient`, `ClientInvoiceUpload`, `ListClientInvoicesParams`, `SupplierInvoice`, `SupplierInvoiceAmount`, `ListSupplierInvoicesParams`, `BulkCreateSupplierInvoiceEntry`, `BulkCreateSupplierInvoiceError`, `BulkCreateSupplierInvoicesResult`, `CreditNote`, `CreditNoteAmount`, `CreditNoteClient`, `CreditNoteItem`

Other: `Quote`, `QuoteAddress`, `QuoteAmount`, `QuoteClient`, `QuoteDiscount`, `QuoteItem`, `Request`, `RequestFlashCard`, `RequestVirtualCard`, `RequestTransfer`, `RequestMultiTransfer`, `EInvoicingSettings`, `Attachment`, `CreateBankAccountParams`, `UpdateBankAccountParams`

## Configuration Resolution

`resolveConfig` resolves the configuration **file** in this order (highest precedence first):

1. `options.configFile` (programmatic — equivalent to the CLI `--config <path>` flag)
2. `QONTOCTL_CONFIG_FILE` environment variable
3. `~/.qontoctl/{profile}.yaml` (when `options.profile` is set)
4. `~/.qontoctl.yaml` (home default)

There is **no** current-working-directory walk-up (removed in v2.0.0 — see [CHANGELOG migration note](https://github.com/alexey-pelykh/qontoctl/blob/main/CHANGELOG.md#1-configuration-file-resolution-cwd-auto-discovery-removed-479)). For repo-local configs, set `QONTOCTL_CONFIG_FILE="$PWD/.qontoctl.yaml"` (e.g. via `direnv`).

After the file is loaded, `QONTOCTL_*` environment variables overlay individual fields (or `QONTOCTL_{PROFILE}_*` with profile prefix). `QONTOCTL_REFRESH_TOKEN` is no longer read (refresh tokens rotate, so env-overlay can't persist correctly); `QONTOCTL_ACCESS_TOKEN` is honored as a one-shot bearer with read-only / discard-after-use semantics (no proactive refresh, no disk persist).

Auth-method precedence between the two configured methods is controlled by `config.auth.preference` — one of `api-key`, `api-key-first`, `oauth`, `oauth-first` (default).

## Requirements

- Node.js >= 24

## License

[AGPL-3.0-only](https://github.com/alexey-pelykh/qontoctl/blob/main/LICENSE) — For commercial licensing, contact the maintainer.
