// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * An insurance contract as returned by the Qonto API.
 */
export interface InsuranceContract {
  readonly id: string;
  readonly insurance_type: string;
  readonly status: string;
  readonly provider_name: string;
  readonly contract_number: string | null;
  readonly start_date: string;
  readonly end_date: string | null;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * A document attached to an insurance contract.
 */
export interface InsuranceDocument {
  readonly id: string;
  readonly file_name: string;
  readonly file_size: string;
  readonly file_content_type: string;
  readonly url: string;
  readonly created_at: string;
}
