// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { QontoApiError } from "../../http-client.js";
import { getEInvoicingSettings } from "../../services/einvoicing.js";
import type { DiagnosticCheck, DiagnosticResult } from "../types.js";

/**
 * Reports the e-invoicing sending and receiving statuses. Reuses
 * the existing `getEInvoicingSettings` service so the check stays
 * a thin wrapper over the canonical schema.
 */
export const einvoicingSettingsCheck: DiagnosticCheck = {
  id: "org.einvoicing-settings",
  name: "E-invoicing settings",
  kind: "live",
  requiresAuth: "either",
  requiresStagingToken: false,
  redactionFields: ["sending_status", "receiving_status"],
  run: async (ctx): Promise<DiagnosticResult> => {
    const client = ctx.apiKeyClient ?? ctx.oauthClient;
    if (client === undefined) {
      return {
        checkId: "org.einvoicing-settings",
        status: "skip",
        detail: "no credentials configured",
        suggestedAction: null,
      };
    }
    try {
      const settings = await getEInvoicingSettings(client);
      return {
        checkId: "org.einvoicing-settings",
        status: "ok",
        detail: `sending=${settings.sending_status}, receiving=${settings.receiving_status}`,
        suggestedAction: null,
        evidence: {
          sending_status: settings.sending_status,
          receiving_status: settings.receiving_status,
        },
      };
    } catch (error) {
      if (error instanceof QontoApiError) {
        // 403 on einvoicing typically means missing `einvoicing.read` scope
        // for OAuth — surface a useful action.
        const action =
          error.status === 403
            ? "Add the `einvoicing.read` OAuth scope (run `qontoctl auth setup` then `qontoctl auth login`)"
            : null;
        return {
          checkId: "org.einvoicing-settings",
          status: "fail",
          detail: `HTTP ${String(error.status)}`,
          suggestedAction: action,
        };
      }
      const message = error instanceof Error ? error.message : String(error);
      return {
        checkId: "org.einvoicing-settings",
        status: "fail",
        detail: `network or transport error: ${message}`,
        suggestedAction: "Check network connectivity to Qonto API host",
      };
    }
  },
};
