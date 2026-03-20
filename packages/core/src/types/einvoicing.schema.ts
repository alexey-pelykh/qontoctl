// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { z } from "zod";

import type { EInvoicingSettings } from "./einvoicing.js";

export const EInvoicingSettingsSchema = z
  .object({
    sending_status: z.string(),
    receiving_status: z.string(),
  })
  .strip() satisfies z.ZodType<EInvoicingSettings>;
