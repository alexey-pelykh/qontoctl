// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * E-invoicing settings as returned by `GET /v2/einvoicing/settings`.
 */
export interface EInvoicingSettings {
  readonly sending_status: string;
  readonly receiving_status: string;
}
