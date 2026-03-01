// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

export {
  HttpClient,
  QontoApiError,
  QontoRateLimitError,
  type HttpClientLogger,
  type HttpClientOptions,
  type QueryParams,
  type QueryParamValue,
  type QontoApiErrorEntry,
} from "./http-client.js";

export {
  resolveConfig,
  ConfigError,
  isValidProfileName,
  loadConfigFile,
  validateConfig,
  applyEnvOverlay,
} from "./config/index.js";

export type {
  ApiKeyCredentials,
  QontoctlConfig,
  ConfigResult,
  ResolveOptions,
  LoadResult,
  ValidationResult,
} from "./config/index.js";

export { AuthError, buildApiKeyAuthorization } from "./auth/index.js";

export { API_BASE_URL, CONFIG_DIR, SANDBOX_BASE_URL } from "./constants.js";

export type { EInvoicingSettings, Label, Membership } from "./types/index.js";

export type { Statement, StatementFile } from "./statements/index.js";

export { buildTransactionQueryParams, getTransaction } from "./transactions/index.js";

export type { Transaction, TransactionLabel, ListTransactionsParams } from "./transactions/index.js";

export type { BankAccount, Organization, PaginationMeta } from "./api-types.js";

export { getBankAccount, resolveDefaultBankAccount } from "./services/bank-accounts.js";
export { getEInvoicingSettings } from "./services/einvoicing.js";
export { getOrganization } from "./services/organization.js";
