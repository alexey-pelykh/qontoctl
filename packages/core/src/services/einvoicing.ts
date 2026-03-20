// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { EInvoicingSettings } from "../types/einvoicing.js";
import { EInvoicingSettingsSchema } from "../types/einvoicing.schema.js";
import type { HttpClient } from "../http-client.js";
import { parseResponse } from "../response.js";

/**
 * Fetch the e-invoicing settings for the organization.
 *
 * @param client - The HTTP client to use for the request.
 * @returns The e-invoicing settings.
 */
export async function getEInvoicingSettings(client: HttpClient): Promise<EInvoicingSettings> {
  const endpointPath = "/v2/einvoicing/settings";
  const response = await client.get(endpointPath);
  return parseResponse(EInvoicingSettingsSchema, response, endpointPath) as EInvoicingSettings;
}
