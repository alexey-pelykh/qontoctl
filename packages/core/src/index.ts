// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

export {
  HttpClient,
  QontoApiError,
  QontoRateLimitError,
  QontoScaRequiredError,
  type Authorization,
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
  saveOAuthTokens,
  saveOAuthClientCredentials,
  clearOAuthTokens,
} from "./config/index.js";

export type {
  ApiKeyCredentials,
  OAuthCredentials,
  QontoctlConfig,
  ConfigResult,
  ResolveOptions,
  LoadResult,
  ValidationResult,
  TokenUpdate,
} from "./config/index.js";

export {
  AuthError,
  buildApiKeyAuthorization,
  buildOAuthAuthorization,
  generateCodeVerifier,
  generateCodeChallenge,
  exchangeCode,
  refreshAccessToken,
  revokeToken,
} from "./auth/index.js";

export type { OAuthTokens } from "./auth/index.js";

export {
  API_BASE_URL,
  CONFIG_DIR,
  SANDBOX_BASE_URL,
  OAUTH_AUTH_URL,
  OAUTH_AUTH_SANDBOX_URL,
  OAUTH_TOKEN_URL,
  OAUTH_TOKEN_SANDBOX_URL,
  OAUTH_REVOKE_URL,
  OAUTH_REVOKE_SANDBOX_URL,
} from "./constants.js";

export type { Beneficiary } from "./types/index.js";
export type { Client, ClientAddress } from "./types/index.js";
export type { CreditNote, CreditNoteAmount, CreditNoteClient, CreditNoteItem } from "./types/index.js";
export type {
  EInvoicingSettings,
  Label,
  Membership,
  Request,
  RequestFlashCard,
  RequestVirtualCard,
  RequestTransfer,
  RequestMultiTransfer,
} from "./types/index.js";

export { buildBeneficiaryQueryParams, getBeneficiary } from "./beneficiaries/index.js";

export type { ListBeneficiariesParams } from "./beneficiaries/index.js";

export type { Quote, QuoteAddress, QuoteAmount, QuoteClient, QuoteDiscount, QuoteItem } from "./types/index.js";

export type { Statement, StatementFile } from "./statements/index.js";

export { buildTransactionQueryParams, getTransaction } from "./transactions/index.js";

export { buildTransferQueryParams, getTransfer } from "./transfers/index.js";

export type { Transfer, ListTransfersParams } from "./transfers/index.js";

export type { Transaction, TransactionLabel, ListTransactionsParams } from "./transactions/index.js";

export {
  buildSupplierInvoiceQueryParams,
  getSupplierInvoice,
  bulkCreateSupplierInvoices,
} from "./supplier-invoices/index.js";

export type {
  SupplierInvoice,
  SupplierInvoiceAmount,
  ListSupplierInvoicesParams,
  BulkCreateSupplierInvoiceEntry,
  BulkCreateSupplierInvoiceError,
  BulkCreateSupplierInvoicesResult,
} from "./supplier-invoices/index.js";

export type { BankAccount, Organization, PaginationMeta } from "./api-types.js";

export { createInternalTransfer } from "./internal-transfers/index.js";

export type { InternalTransfer, CreateInternalTransferParams } from "./internal-transfers/index.js";

export { getBulkTransfer } from "./bulk-transfers/index.js";

export type { BulkTransfer, BulkTransferResult, BulkTransferResultError } from "./bulk-transfers/index.js";

export { getRecurringTransfer } from "./recurring-transfers/index.js";

export type { RecurringTransfer } from "./recurring-transfers/index.js";

export {
  uploadAttachment,
  getAttachment,
  listTransactionAttachments,
  addTransactionAttachment,
  removeAllTransactionAttachments,
  removeTransactionAttachment,
} from "./attachments/index.js";

export type { Attachment } from "./attachments/index.js";

export {
  createBankAccount,
  getBankAccount,
  getIbanCertificate,
  updateBankAccount,
  closeBankAccount,
  resolveDefaultBankAccount,
} from "./services/bank-accounts.js";

export type { CreateBankAccountParams, UpdateBankAccountParams } from "./services/bank-accounts.js";
export { getEInvoicingSettings } from "./services/einvoicing.js";
export { getOrganization } from "./services/organization.js";

export {
  ScaDeniedError,
  ScaTimeoutError,
  getScaSession,
  mockScaDecision,
  pollScaSession,
  executeWithSca,
} from "./sca/index.js";

export type {
  ScaMethod,
  ScaSession,
  ScaSessionStatus,
  PollScaSessionOptions,
  ExecuteWithScaCallbacks,
  ExecuteWithScaOptions,
} from "./sca/index.js";
