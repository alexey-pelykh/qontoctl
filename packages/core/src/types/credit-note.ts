// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * An amount with value and currency.
 */
export interface CreditNoteAmount {
  readonly value: string;
  readonly currency: string;
}

/**
 * A line item on a credit note.
 */
export interface CreditNoteItem {
  readonly title: string;
  readonly description: string;
  readonly quantity: string;
  readonly unit: string;
  readonly unit_price: CreditNoteAmount;
  readonly unit_price_cents: number;
  readonly vat_rate: string;
  readonly total_vat: CreditNoteAmount;
  readonly total_vat_cents: number;
  readonly total_amount: CreditNoteAmount;
  readonly total_amount_cents: number;
  readonly subtotal: CreditNoteAmount;
  readonly subtotal_cents: number;
}

/**
 * A client embedded in a credit note.
 */
export interface CreditNoteClient {
  readonly id: string;
  readonly name: string;
  readonly first_name: string;
  readonly last_name: string;
  readonly type: string;
  readonly email: string;
  readonly vat_number: string;
  readonly tax_identification_number: string;
  readonly address: string;
  readonly city: string;
  readonly zip_code: string;
  readonly country_code: string;
  readonly locale: string;
}

/**
 * A Qonto credit note issued to correct or cancel a previously issued invoice.
 */
export interface CreditNote {
  readonly id: string;
  readonly invoice_id: string;
  readonly attachment_id: string;
  readonly number: string;
  readonly issue_date: string;
  readonly invoice_issue_date: string;
  readonly header: string;
  readonly footer: string;
  readonly terms_and_conditions: string;
  readonly currency: string;
  readonly vat_amount: CreditNoteAmount;
  readonly vat_amount_cents: number;
  readonly total_amount: CreditNoteAmount;
  readonly total_amount_cents: number;
  readonly stamp_duty_amount: string;
  readonly created_at: string;
  readonly finalized_at: string;
  readonly contact_email: string;
  readonly invoice_url: string;
  readonly einvoicing_status: string;
  readonly items: readonly CreditNoteItem[];
  readonly client: CreditNoteClient;
}
