// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * A SEPA beneficiary — a recipient of SEPA transfers.
 *
 * `bic` is nullable: the Qonto API derives BIC from IBAN where possible (e.g.,
 * French SEPA IBANs), but returns `null` when derivation fails (typical for
 * foreign-bank or partial-data beneficiaries).
 *
 * `currency` is the ISO 4217 currency code (e.g. "EUR") of the beneficiary's
 * bank account; surfaced flat from the same source as `iban`/`bic` (#621).
 * Optional + nullable because production omits it for legacy beneficiaries
 * while sandbox returns it nested under `bank_account.currency`.
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
  readonly currency?: string | null | undefined;
}
