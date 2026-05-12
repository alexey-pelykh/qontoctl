// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

/**
 * Monetary amount for a terminal payment.
 *
 * `value` is a decimal string (e.g. `"12.50"`) — the Qonto API rejects
 * floating-point JSON numbers here (precision loss on the wire) and requires
 * the literal decimal-string form. Range: `0.10` – `100000.00` inclusive.
 *
 * `currency` is ISO 4217. Qonto Terminals currently only accept `EUR`.
 */
export interface TerminalAmount {
  readonly value: string;
  readonly currency: "EUR";
}

/**
 * A physical Qonto Terminal (POS card reader) linked to the organization.
 *
 * Returned by `GET /v2/terminals`. `poi_id` is the manufacturer's
 * point-of-interaction identifier; pair it with terminal-side serial labels
 * when correlating with hardware.
 */
export interface Terminal {
  readonly id: string;
  readonly poi_id: string;
  readonly created_at: string;
  readonly updated_at: string;
}

/**
 * A payment initiated against a terminal via `POST /v2/terminals/{id}/payment`.
 *
 * The API returns this object wrapped under `terminal_payment` with a
 * `202 Accepted` status — the terminal still has to physically accept the
 * card before the payment settles, so the response is acknowledgement of
 * the request, not confirmation of clearing.
 *
 * `metadata` is the same free-form JSON the caller posted (echoed back).
 */
export interface TerminalPayment {
  readonly id: string;
  readonly terminal_id: string;
  readonly amount: TerminalAmount;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
  readonly created_at: string;
}

/**
 * Parameters for creating a terminal payment.
 *
 * `metadata` is optional and capped at 1 KB by the Qonto API. Use it for
 * order/table/receipt references that need to round-trip back via the
 * terminal-payments webhook event.
 */
export interface CreateTerminalPaymentParams {
  readonly amount: TerminalAmount;
  readonly metadata?: Readonly<Record<string, unknown>>;
}
