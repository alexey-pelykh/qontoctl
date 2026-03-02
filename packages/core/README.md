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
- **`QontoRateLimitError`** — error for rate-limit (429) responses
- **`QontoScaRequiredError`** — error for SCA-required (403) responses

### SCA (Strong Customer Authentication)

- **`getScaSession(client, scaId)`** — retrieve an SCA session by ID
- **`pollScaSession(client, scaId, options?)`** — poll an SCA session until completion
- **`executeWithSca(fn, callbacks, options?)`** — execute an API call with SCA handling
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

QontoCtl resolves credentials in this order:

1. `QONTOCTL_*` environment variables (highest priority)
2. `.qontoctl.yaml` in the current directory
3. `~/.qontoctl.yaml` (home default)

With `--profile <name>`:

1. `QONTOCTL_<NAME>_*` environment variables
2. `~/.qontoctl/<name>.yaml`

## Requirements

- Node.js >= 24

## License

[AGPL-3.0-only](https://github.com/alexey-pelykh/qontoctl/blob/main/LICENSE) — For commercial licensing, contact the maintainer.
