// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { QontoApiError } from "../../http-client.js";
import { listBankAccounts } from "../../services/bank-accounts.js";
import type { DiagnosticCheck, DiagnosticResult } from "../types.js";
import { readCachedOrganization } from "./org-metadata.js";

/**
 * Reports the number of bank accounts on the organization. Reuses the
 * `org.metadata` cached `Organization` when available (which embeds
 * `bank_accounts`), falling back to a direct `listBankAccounts` call
 * when the cache is empty (e.g., `org.metadata` failed but credentials
 * still permit a list call).
 */
export const bankAccountsCountCheck: DiagnosticCheck = {
  id: "org.bank-accounts-count",
  name: "Bank accounts count",
  kind: "live",
  requiresAuth: "either",
  requiresStagingToken: false,
  redactionFields: ["count", "source"],
  run: async (ctx): Promise<DiagnosticResult> => {
    const cached = readCachedOrganization(ctx);
    if (cached !== undefined) {
      const count = cached.bank_accounts.length;
      return {
        checkId: "org.bank-accounts-count",
        status: "ok",
        detail: `${String(count)} bank account${count === 1 ? "" : "s"}`,
        suggestedAction: null,
        evidence: { count, source: "cached-organization" },
      };
    }

    const client = ctx.apiKeyClient ?? ctx.oauthClient;
    if (client === undefined) {
      return {
        checkId: "org.bank-accounts-count",
        status: "skip",
        detail: "no credentials configured",
        suggestedAction: null,
      };
    }
    try {
      const result = await listBankAccounts(client);
      const count = result.bank_accounts.length;
      return {
        checkId: "org.bank-accounts-count",
        status: "ok",
        detail: `${String(count)} bank account${count === 1 ? "" : "s"}`,
        suggestedAction: null,
        evidence: { count, source: "list-bank-accounts" },
      };
    } catch (error) {
      if (error instanceof QontoApiError) {
        return {
          checkId: "org.bank-accounts-count",
          status: "fail",
          detail: `HTTP ${String(error.status)}`,
          suggestedAction: null,
          evidence: { count: 0, source: "list-bank-accounts" },
        };
      }
      const message = error instanceof Error ? error.message : String(error);
      return {
        checkId: "org.bank-accounts-count",
        status: "fail",
        detail: `network or transport error: ${message}`,
        suggestedAction: "Check network connectivity to Qonto API host",
      };
    }
  },
};
