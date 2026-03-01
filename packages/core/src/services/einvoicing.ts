// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import type { EInvoicingSettings } from "../types/einvoicing.js";
import type { HttpClient } from "../http-client.js";

/**
 * Fetch the e-invoicing settings for the organization.
 *
 * @param client - The HTTP client to use for the request.
 * @returns The e-invoicing settings.
 */
export async function getEInvoicingSettings(client: HttpClient): Promise<EInvoicingSettings> {
  return client.get<EInvoicingSettings>("/v2/einvoicing/settings");
}
