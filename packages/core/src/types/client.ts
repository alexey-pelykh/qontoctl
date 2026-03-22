// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * Address associated with a client (billing or delivery).
 */
export interface ClientAddress {
  readonly street_address: string | null;
  readonly city: string | null;
  readonly zip_code: string | null;
  readonly province_code: string | null;
  readonly country_code: string | null;
}

/**
 * A Qonto client (contact/customer) used for invoicing.
 */
export interface Client {
  readonly id: string;
  readonly type?: string | undefined;
  readonly name: string | null;
  readonly first_name: string | null;
  readonly last_name: string | null;
  readonly kind: "company" | "individual" | "freelancer";
  readonly email: string | null;
  readonly vat_number?: string | null | undefined;
  readonly tax_identification_number?: string | null | undefined;
  readonly address?: string | null | undefined;
  readonly city?: string | null | undefined;
  readonly zip_code?: string | null | undefined;
  readonly province_code?: string | null | undefined;
  readonly country_code?: string | null | undefined;
  readonly billing_address: ClientAddress | null;
  readonly delivery_address?: ClientAddress | null | undefined;
  readonly locale?: string | null | undefined;
  readonly currency?: string | null | undefined;
  readonly created_at: string;
  readonly updated_at: string;
}
