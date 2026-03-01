// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * Parameters for listing SEPA beneficiaries.
 */
export interface ListBeneficiariesParams {
  readonly status?: readonly string[];
  readonly trusted?: boolean;
  readonly iban?: readonly string[];
  readonly updated_at_from?: string;
  readonly updated_at_to?: string;
  readonly sort_by?: string;
}
