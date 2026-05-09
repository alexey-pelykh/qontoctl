// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * Allowed values for `InsuranceContract.origin`.
 */
export type InsuranceContractOrigin = "insurance_hub" | "qonto_other" | "stello";

/**
 * Allowed values for `InsuranceContract.status`.
 */
export type InsuranceContractStatus =
  | "active"
  | "pending_payment"
  | "pending_others"
  | "action_required"
  | "expired"
  | "archived";

/**
 * Allowed values for `InsuranceContract.payment_frequency`.
 */
export type InsuranceContractPaymentFrequency = "month" | "quarter" | "semester" | "annual";

/**
 * Price object on an insurance contract.
 */
export interface InsuranceContractPrice {
  readonly value: string;
  readonly currency: string;
}

/**
 * Document attached to an insurance contract, as returned in the contract response.
 */
export interface InsuranceContractDocumentRef {
  readonly id: string;
  readonly name: string;
  readonly type: string;
}

/**
 * An insurance contract as returned by the Qonto API.
 *
 * Date and URL fields that are not set on a contract are returned as `null`
 * (not omitted) by the Qonto API, so they are typed as `string | null | undefined`.
 *
 * @see https://docs.qonto.com/api-reference/business-api/expense-management/insurance-contracts
 */
export interface InsuranceContract {
  readonly id: string;
  readonly name: string;
  readonly contract_id: string;
  readonly origin: InsuranceContractOrigin;
  readonly provider_slug: string;
  readonly type: string;
  readonly status: InsuranceContractStatus;
  readonly payment_frequency: InsuranceContractPaymentFrequency;
  readonly price: InsuranceContractPrice;
  readonly start_date?: string | null | undefined;
  readonly expiration_date?: string | null | undefined;
  readonly renewal_date?: string | null | undefined;
  readonly service_url?: string | null | undefined;
  readonly troubleshooting_url?: string | null | undefined;
  readonly documents?: readonly InsuranceContractDocumentRef[] | null | undefined;
}

/**
 * A document attached to an insurance contract, as returned by the upload-document endpoint.
 */
export interface InsuranceDocument {
  readonly id: string;
  readonly file_name: string;
  readonly file_size: string;
  readonly file_content_type: string;
  readonly url: string;
  readonly created_at: string;
}
