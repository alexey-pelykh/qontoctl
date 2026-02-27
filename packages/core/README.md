# @qontoctl/core

Core library for [Qonto](https://qonto.com) API integration — HTTP client, authentication, configuration, and typed service functions.

Part of the [QontoCtl](https://github.com/alexey-pelykh/qontoctl) project.

## Installation

```sh
npm install @qontoctl/core
```

## Usage

```ts
import { resolveConfig, buildApiKeyAuthorization, HttpClient, API_BASE_URL, getOrganization } from "@qontoctl/core";

// Resolve configuration from file or environment
const config = await resolveConfig();

// Build authorization headers
const auth = buildApiKeyAuthorization(config.credentials);

// Create an HTTP client
const client = new HttpClient({ baseUrl: API_BASE_URL, auth });

// Fetch organization details
const org = await getOrganization(client);
```

## API

### Configuration

- **`resolveConfig(options?)`** — resolve credentials from config files and environment variables
- **`loadConfigFile(path)`** — load a YAML configuration file
- **`validateConfig(config)`** — validate configuration structure
- **`applyEnvOverlay(config, prefix?)`** — overlay environment variable overrides

### Authentication

- **`buildApiKeyAuthorization(credentials)`** — build authorization headers from API key credentials

### HTTP Client

- **`HttpClient`** — HTTP client for the Qonto API with rate-limit handling
- **`QontoApiError`** — typed error for Qonto API error responses
- **`QontoRateLimitError`** — error for rate-limit (429) responses

### Services

- **`getOrganization(client)`** — fetch organization details
- **`getBankAccount(client, id)`** — fetch a bank account by ID
- **`getTransaction(client, id)`** — fetch a transaction by ID
- **`buildTransactionQueryParams(params)`** — build query parameters for transaction listing

### Types

- `Organization`, `BankAccount`, `Transaction`, `TransactionLabel`
- `Label`, `Membership`, `Statement`, `StatementFile`
- `QontoctlConfig`, `ApiKeyCredentials`, `ListTransactionsParams`

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
