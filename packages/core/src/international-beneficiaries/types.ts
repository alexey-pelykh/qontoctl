// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * An international beneficiary — a recipient of international transfers.
 */
export interface IntlBeneficiary {
  readonly id: string;
  readonly name: string;
  readonly country: string;
  readonly currency: string;
  readonly created_at: string;
  readonly updated_at: string;
  readonly [key: string]: unknown;
}

/**
 * A requirement field for an international beneficiary corridor.
 */
export interface IntlBeneficiaryRequirementField {
  readonly key: string;
  readonly name: string;
  readonly type: string;
  readonly example?: string | undefined;
  readonly validation_regexp?: string | undefined;
  readonly min_length?: number | undefined;
  readonly max_length?: number | undefined;
  readonly [key: string]: unknown;
}

/**
 * Requirements for creating/updating an international beneficiary in a specific corridor.
 */
export interface IntlBeneficiaryRequirements {
  readonly fields: readonly IntlBeneficiaryRequirementField[];
  readonly [key: string]: unknown;
}

/**
 * Parameters for creating an international beneficiary.
 */
export interface CreateIntlBeneficiaryParams {
  readonly country: string;
  readonly currency: string;
  readonly [key: string]: unknown;
}

/**
 * Parameters for updating an international beneficiary.
 */
export interface UpdateIntlBeneficiaryParams {
  readonly [key: string]: unknown;
}
