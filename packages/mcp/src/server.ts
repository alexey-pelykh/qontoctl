// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient, ResolveOptions } from "@qontoctl/core";
import {
  registerAttachmentTools,
  registerAccountTools,
  registerBeneficiaryTools,
  registerCardTools,
  registerBulkTransferTools,
  registerClientTools,
  registerClientInvoiceTools,
  registerCreditNoteTools,
  registerDiagnoseTools,
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
  registerProductTools,
  registerQuoteTools,
  registerRecurringTransferTools,
  registerRequestTools,
  registerScaSessionTools,
  registerStatementTools,
  registerSupplierInvoiceTools,
  registerTeamTools,
  registerTerminalTools,
  registerTransactionTools,
  registerTransferTools,
  registerWebhookTools,
} from "./tools/index.js";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version: string };

export interface CreateServerOptions {
  readonly getClient: () => Promise<HttpClient>;
  /**
   * Base config-resolution selection captured at server launch — the same
   * `{ path?, profile? }` the data-tool client factory (`getClient`) resolves
   * through. Threaded into the `diagnose` tool so it resolves credentials via
   * the launch `--profile` / `--config` instead of being blind to them (#658).
   * The standalone `qontoctl-mcp` entry threads it too, from its startup
   * `QONTOCTL_CONFIG_FILE` capture, so diagnose stays in lockstep with that
   * entry's `getClient` (#661).
   *
   * Omitted only when there is no selection to thread — e.g. standalone
   * `qontoctl-mcp` started with `QONTOCTL_CONFIG_FILE` unset — in which case
   * `diagnose` falls back to reading `QONTOCTL_CONFIG_FILE` via
   * `buildMcpResolveOptions`, in lockstep with `getClient`'s own
   * `resolveConfig(undefined)` live-read.
   */
  readonly resolveOptions?: Pick<ResolveOptions, "path" | "profile">;
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
  registerDiagnoseTools(server, options?.resolveOptions);
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
  registerProductTools(server, getClient);
  registerQuoteTools(server, getClient);
  registerRecurringTransferTools(server, getClient);
  registerRequestTools(server, getClient);
  registerScaSessionTools(server, getClient);
  registerStatementTools(server, getClient);
  registerSupplierInvoiceTools(server, getClient);
  registerTeamTools(server, getClient);
  registerTerminalTools(server, getClient);
  registerTransactionTools(server, getClient);
  registerTransferTools(server, getClient);
  registerWebhookTools(server, getClient);

  return server;
}
