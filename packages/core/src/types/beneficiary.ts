// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * A SEPA beneficiary — a recipient of SEPA transfers.
 *
 * `bic` is nullable: the Qonto API derives BIC from IBAN where possible (e.g.,
 * French SEPA IBANs), but returns `null` when derivation fails (typical for
 * foreign-bank or partial-data beneficiaries).
 */
export interface Beneficiary {
  readonly id: string;
  readonly name: string;
  readonly iban: string;
  readonly bic: string | null;
  readonly email: string | null;
  readonly activity_tag: string | null;
  readonly status: "pending" | "validated" | "declined";
  readonly trusted: boolean;
  readonly created_at: string;
  readonly updated_at: string;
}
