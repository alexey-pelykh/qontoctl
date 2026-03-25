// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

export {
  HttpClient,
  QontoApiError,
  QontoOAuthScopeError,
  QontoRateLimitError,
  QontoScaRequiredError,
  type Authorization,
  type FallbackWarningHandler,
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
  saveOAuthScopes,
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
  createOAuthAuthorization,
  generateCodeVerifier,
  generateCodeChallenge,
  exchangeCode,
  refreshAccessToken,
  revokeToken,
} from "./auth/index.js";

export type { CreateOAuthAuthorizationOptions, OAuthTokens } from "./auth/index.js";

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
export type {
  Card,
  CardAppearance,
  CardLevelAppearance,
  CardLevelAppearances,
  CardTypeAppearances,
  ParentCardSummary,
} from "./types/index.js";
export type { Client, ClientAddress } from "./types/index.js";
export { ClientAddressSchema, ClientSchema, ClientResponseSchema, ClientListResponseSchema } from "./types/index.js";
export type { CreditNote, CreditNoteAmount, CreditNoteClient, CreditNoteItem } from "./types/index.js";
export {
  CreditNoteAmountSchema,
  CreditNoteClientSchema,
  CreditNoteItemSchema,
  CreditNoteSchema,
  CreditNoteResponseSchema,
  CreditNoteListResponseSchema,
} from "./types/index.js";
export type {
  EInvoicingSettings,
  Label,
  Membership,
  Request,
  RequestFlashCard,
  RequestVirtualCard,
  RequestTransfer,
  RequestMultiTransfer,
  Team,
  WebhookSubscription,
} from "./types/index.js";
export { EInvoicingSettingsSchema } from "./types/index.js";
export { LabelSchema, LabelResponseSchema, LabelListResponseSchema } from "./types/index.js";
export { MembershipSchema, MembershipResponseSchema, MembershipListResponseSchema } from "./types/index.js";
export {
  QuoteAddressSchema,
  QuoteAmountSchema,
  QuoteClientSchema,
  QuoteDiscountSchema,
  QuoteItemSchema,
  QuoteSchema,
  QuoteResponseSchema,
  QuoteListResponseSchema,
} from "./types/index.js";
export { TeamSchema, TeamResponseSchema, TeamListResponseSchema } from "./types/index.js";

export {
  buildBeneficiaryQueryParams,
  listBeneficiaries,
  getBeneficiary,
  createBeneficiary,
  updateBeneficiary,
  trustBeneficiaries,
  untrustBeneficiaries,
  BeneficiarySchema,
  BeneficiaryResponseSchema,
  BeneficiaryListResponseSchema,
} from "./beneficiaries/index.js";

export type {
  CreateBeneficiaryParams,
  ListBeneficiariesParams,
  UpdateBeneficiaryParams,
} from "./beneficiaries/index.js";

export {
  buildCardQueryParams,
  getCard,
  listCards,
  createCard,
  bulkCreateCards,
  lockCard,
  unlockCard,
  reportCardLost,
  reportCardStolen,
  discardCard,
  updateCardLimits,
  updateCardNickname,
  updateCardOptions,
  updateCardRestrictions,
  getCardIframeUrl,
  listCardAppearances,
  CardAppearanceSchema,
  CardLevelAppearanceSchema,
  CardLevelAppearancesSchema,
  CardListResponseSchema,
  CardResponseSchema,
  CardSchema,
  CardTypeAppearancesSchema,
  ParentCardSummarySchema,
} from "./cards/index.js";

export type {
  CreateCardParams,
  ListCardsParams,
  UpdateCardLimitsParams,
  UpdateCardOptionsParams,
  UpdateCardRestrictionsParams,
  CardAddress,
} from "./cards/index.js";

export type { Quote, QuoteAddress, QuoteAmount, QuoteClient, QuoteDiscount, QuoteItem } from "./types/index.js";

export type { Statement, StatementFile, ListStatementsParams } from "./statements/index.js";
export {
  buildStatementQueryParams,
  getStatement,
  listStatements,
  StatementFileSchema,
  StatementSchema,
  StatementResponseSchema,
  StatementListResponseSchema,
} from "./statements/index.js";

export {
  buildTransactionQueryParams,
  getTransaction,
  listTransactions,
  TransactionSchema,
  TransactionLabelSchema,
  TransactionResponseSchema,
  TransactionListResponseSchema,
} from "./transactions/index.js";

export {
  buildTransferQueryParams,
  listTransfers,
  getTransfer,
  createTransfer,
  cancelTransfer,
  getTransferProof,
  verifyPayee,
  bulkVerifyPayee,
  TransferSchema,
  TransferResponseSchema,
  TransferListResponseSchema,
  VopMatchResultSchema,
  VopResultSchema,
  VopResultResponseSchema,
  BulkVopResultEntrySchema,
  BulkVopResultResponseSchema,
} from "./transfers/index.js";

export type {
  Transfer,
  InlineBeneficiary,
  ListTransfersParams,
  CreateTransferParams,
  VopMatchResult,
  VopEntry,
  VopResult,
  BulkVopResultEntry,
  BulkVopResult,
} from "./transfers/index.js";

export type { Transaction, TransactionLabel, ListTransactionsParams } from "./transactions/index.js";

export {
  buildSupplierInvoiceQueryParams,
  getSupplierInvoice,
  listSupplierInvoices,
  bulkCreateSupplierInvoices,
  SupplierInvoiceAmountSchema,
  SupplierInvoiceSchema,
  SupplierInvoiceResponseSchema,
  SupplierInvoiceListResponseSchema,
  BulkCreateSupplierInvoiceErrorSchema,
  BulkCreateSupplierInvoicesResultSchema,
} from "./supplier-invoices/index.js";

export type {
  SupplierInvoice,
  SupplierInvoiceAmount,
  ListSupplierInvoicesParams,
  BulkCreateSupplierInvoiceEntry,
  BulkCreateSupplierInvoiceError,
  BulkCreateSupplierInvoicesResult,
} from "./supplier-invoices/index.js";

export {
  buildClientInvoiceQueryParams,
  listClientInvoices,
  getClientInvoice,
  createClientInvoice,
  updateClientInvoice,
  deleteClientInvoice,
  finalizeClientInvoice,
  sendClientInvoice,
  markClientInvoicePaid,
  unmarkClientInvoicePaid,
  cancelClientInvoice,
  uploadClientInvoiceFile,
  getClientInvoiceUpload,
} from "./client-invoices/index.js";

export type {
  ClientInvoice,
  ClientInvoiceAmount,
  ClientInvoiceDiscount,
  ClientInvoiceItem,
  ClientInvoiceAddress,
  ClientInvoiceClient,
  ClientInvoiceUpload,
  ListClientInvoicesParams,
} from "./client-invoices/index.js";

export {
  ClientInvoiceAmountSchema,
  ClientInvoiceDiscountSchema,
  ClientInvoiceItemSchema,
  ClientInvoiceAddressSchema,
  ClientInvoiceClientSchema,
  ClientInvoiceUploadSchema,
  ClientInvoiceSchema,
  ClientInvoiceResponseSchema,
  ClientInvoiceListResponseSchema,
} from "./client-invoices/index.js";

export {
  listWebhooks,
  getWebhook,
  createWebhook,
  updateWebhook,
  deleteWebhook,
  WebhookSubscriptionSchema,
  WebhookSubscriptionResponseSchema,
  WebhookSubscriptionListResponseSchema,
} from "./webhooks/index.js";

export type { CreateWebhookParams, UpdateWebhookParams } from "./webhooks/index.js";

export {
  approveRequest,
  declineRequest,
  createFlashCardRequest,
  createVirtualCardRequest,
  createMultiTransferRequest,
} from "./requests/index.js";

export type {
  RequestType,
  ApproveRequestParams,
  DeclineRequestParams,
  CreateFlashCardRequestParams,
  CreateVirtualCardRequestParams,
  MultiTransferItem,
  CreateMultiTransferRequestParams,
} from "./requests/index.js";

export {
  RequestFlashCardSchema,
  RequestVirtualCardSchema,
  RequestTransferSchema,
  RequestMultiTransferSchema,
  RequestSchema,
  RequestListResponseSchema,
} from "./requests/index.js";

export {
  listIntlBeneficiaries,
  getIntlBeneficiaryRequirements,
  createIntlBeneficiary,
  updateIntlBeneficiary,
  removeIntlBeneficiary,
  IntlBeneficiarySchema,
  IntlBeneficiaryResponseSchema,
  IntlBeneficiaryListResponseSchema,
  IntlBeneficiaryRequirementFieldSchema,
  IntlBeneficiaryRequirementsSchema,
  IntlBeneficiaryRequirementsResponseSchema,
} from "./international-beneficiaries/index.js";

export type {
  IntlBeneficiary,
  IntlBeneficiaryRequirementField,
  IntlBeneficiaryRequirements,
  CreateIntlBeneficiaryParams,
  UpdateIntlBeneficiaryParams,
} from "./international-beneficiaries/index.js";

export {
  getIntlTransferRequirements,
  createIntlTransfer,
  IntlTransferRequirementFieldSchema,
  IntlTransferRequirementsSchema,
  IntlTransferRequirementsResponseSchema,
  IntlTransferSchema,
  IntlTransferResponseSchema,
} from "./international-transfers/index.js";

export type {
  IntlTransfer,
  IntlTransferRequirementField,
  IntlTransferRequirements,
  CreateIntlTransferParams,
} from "./international-transfers/index.js";

export {
  getIntlEligibility,
  listIntlCurrencies,
  createIntlQuote,
  IntlEligibilitySchema,
  IntlEligibilityResponseSchema,
  IntlCurrencySchema,
  IntlCurrencyListResponseSchema,
  IntlQuoteSchema,
  IntlQuoteResponseSchema,
} from "./international/index.js";

export type { IntlEligibility, IntlCurrency, IntlQuote, CreateIntlQuoteParams } from "./international/index.js";

export { parseResponse } from "./response.js";

export type { BankAccount, Organization, PaginationMeta } from "./api-types.js";
export { BankAccountSchema, OrganizationSchema, PaginationMetaSchema } from "./api-types.schema.js";

export {
  createInternalTransfer,
  InternalTransferSchema,
  InternalTransferResponseSchema,
} from "./internal-transfers/index.js";

export type { InternalTransfer, CreateInternalTransferParams } from "./internal-transfers/index.js";

export {
  getBulkTransfer,
  listBulkTransfers,
  BulkTransferSchema,
  BulkTransferResponseSchema,
  BulkTransferListResponseSchema,
  BulkTransferResultSchema,
  BulkTransferResultErrorSchema,
} from "./bulk-transfers/index.js";

export type { BulkTransfer, BulkTransferResult, BulkTransferResultError } from "./bulk-transfers/index.js";

export {
  getRecurringTransfer,
  listRecurringTransfers,
  RecurringTransferSchema,
  RecurringTransferResponseSchema,
  RecurringTransferListResponseSchema,
} from "./recurring-transfers/index.js";

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
export { AttachmentSchema } from "./attachments/index.js";

export {
  getInsuranceContract,
  createInsuranceContract,
  updateInsuranceContract,
  uploadInsuranceDocument,
  removeInsuranceDocument,
  InsuranceContractSchema,
  InsuranceContractResponseSchema,
  InsuranceDocumentSchema,
  InsuranceDocumentResponseSchema,
} from "./insurance-contracts/index.js";

export type {
  InsuranceContract,
  InsuranceDocument,
  CreateInsuranceContractParams,
  UpdateInsuranceContractParams,
} from "./insurance-contracts/index.js";

export {
  createBankAccount,
  getBankAccount,
  listBankAccounts,
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
  ScaSessionSchema,
  ScaSessionStatusSchema,
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
