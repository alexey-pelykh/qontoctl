// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * A SEPA beneficiary — a recipient of SEPA transfers.
 */
export interface Beneficiary {
  readonly id: string;
  readonly name: string;
  readonly iban: string;
  readonly bic: string;
  readonly email: string | null;
  readonly activity_tag: string | null;
  readonly status: "pending" | "validated" | "declined";
  readonly trusted: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}
