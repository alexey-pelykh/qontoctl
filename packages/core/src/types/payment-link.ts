// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * A monetary amount with value and currency.
 */
export interface PaymentLinkAmount {
  readonly value: string;
  readonly currency: string;
}

/**
 * An item in a basket-type payment link.
 */
export interface PaymentLinkItem {
  readonly title: string;
  readonly type?: string | undefined;
  readonly description?: string | undefined;
  readonly quantity: number;
  readonly measure_unit?: string | undefined;
  readonly unit_price: PaymentLinkAmount;
  readonly vat_rate: string;
}

/**
 * A Qonto payment link.
 */
export interface PaymentLink {
  readonly id: string;
  readonly status: string;
  readonly expiration_date: string;
  readonly potential_payment_methods: readonly string[];
  readonly amount: PaymentLinkAmount;
  readonly resource_type: string;
  readonly items: readonly PaymentLinkItem[] | null;
  readonly reusable: boolean;
  readonly invoice_id: string | null;
  readonly invoice_number: string | null;
  readonly debitor_name: string | null;
  readonly created_at: string;
  readonly url: string;
}

/**
 * A payment associated with a payment link.
 */
export interface PaymentLinkPayment {
  readonly id: string;
  readonly amount: PaymentLinkAmount;
  readonly status: string;
  readonly created_at: string;
  readonly payment_method: string;
  readonly paid_at: string | null;
  readonly debitor_email: string;
}

/**
 * An available payment method for payment links.
 */
export interface PaymentLinkPaymentMethod {
  readonly name: string;
  readonly enabled: boolean;
}

/**
 * Payment link connection status.
 */
export interface PaymentLinkConnection {
  readonly connection_location: string;
  readonly status: string;
  readonly bank_account_id: string;
}
