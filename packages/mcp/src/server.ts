// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient } from "@qontoctl/core";
import {
  registerAttachmentTools,
  registerAccountTools,
  registerBeneficiaryTools,
  registerCardTools,
  registerBulkTransferTools,
  registerClientTools,
  registerClientInvoiceTools,
  registerCreditNoteTools,
  registerEInvoicingTools,
  registerInsuranceTools,
  registerInternationalTools,
  registerIntlBeneficiaryTools,
  registerIntlTransferTools,
  registerInternalTransferTools,
  registerLabelTools,
  registerMembershipTools,
  registerOrgTools,
  registerPaymentLinkTools,
  registerQuoteTools,
  registerRecurringTransferTools,
  registerRequestTools,
  registerStatementTools,
  registerSupplierInvoiceTools,
  registerTeamTools,
  registerTransactionTools,
  registerTransferTools,
  registerWebhookTools,
} from "./tools/index.js";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version: string };

export interface CreateServerOptions {
  readonly getClient: () => Promise<HttpClient>;
}

export function createServer(options?: CreateServerOptions): McpServer {
  const server = new McpServer({
    name: "qontoctl",
    version: packageJson.version,
  });

  const getClient =
    options?.getClient ??
    (() => {
      throw new Error("No credentials configured. Run 'qontoctl profile add' first.");
    });

  registerAttachmentTools(server, getClient);
  registerAccountTools(server, getClient);
  registerBeneficiaryTools(server, getClient);
  registerCardTools(server, getClient);
  registerBulkTransferTools(server, getClient);
  registerClientTools(server, getClient);
  registerClientInvoiceTools(server, getClient);
  registerCreditNoteTools(server, getClient);
  registerEInvoicingTools(server, getClient);
  registerInsuranceTools(server, getClient);
  registerInternationalTools(server, getClient);
  registerIntlBeneficiaryTools(server, getClient);
  registerIntlTransferTools(server, getClient);
  registerInternalTransferTools(server, getClient);
  registerLabelTools(server, getClient);
  registerMembershipTools(server, getClient);
  registerOrgTools(server, getClient);
  registerPaymentLinkTools(server, getClient);
  registerQuoteTools(server, getClient);
  registerRecurringTransferTools(server, getClient);
  registerRequestTools(server, getClient);
  registerStatementTools(server, getClient);
  registerSupplierInvoiceTools(server, getClient);
  registerTeamTools(server, getClient);
  registerTransactionTools(server, getClient);
  registerTransferTools(server, getClient);
  registerWebhookTools(server, getClient);

  return server;
}
