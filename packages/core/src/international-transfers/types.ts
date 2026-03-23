// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * A requirement field for an international transfer.
 */
export interface IntlTransferRequirementField {
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
 * Requirements for creating an international transfer for a specific beneficiary + quote.
 */
export interface IntlTransferRequirements {
  readonly fields: readonly IntlTransferRequirementField[];
  readonly [key: string]: unknown;
}

/**
 * An international transfer.
 */
export interface IntlTransfer {
  readonly id: string;
  readonly [key: string]: unknown;
}

/**
 * Parameters for creating an international transfer.
 */
export interface CreateIntlTransferParams {
  readonly beneficiary_id: string;
  readonly quote_id: string;
  readonly [key: string]: unknown;
}
