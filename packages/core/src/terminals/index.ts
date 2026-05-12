// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

export { listTerminals, createTerminalPayment } from "./service.js";

export {
  TerminalAmountSchema,
  TerminalSchema,
  TerminalListResponseSchema,
  TerminalPaymentSchema,
  TerminalPaymentResponseSchema,
} from "./schemas.js";

export type { CreateTerminalPaymentParams, Terminal, TerminalAmount, TerminalPayment } from "./types.js";
