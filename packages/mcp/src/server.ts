// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { createRequire } from "node:module";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { resolveConfig, type ConfigResult, type HttpClient, type ResolveOptions } from "@qontoctl/core";
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

/**
 * The config-resolution selection a server is launched with — the `path` /
 * `profile` captured from `--config` / `--profile` (umbrella `qontoctl mcp`) or
 * from `QONTOCTL_CONFIG_FILE` (standalone `qontoctl-mcp`).
 */
export type ServerConfigSelection = Pick<ResolveOptions, "path" | "profile">;

/**
 * Build the data-tool {@link HttpClient} from an already-resolved config.
 *
 * Synchronous by contract: the only async step (config resolution) is owned by
 * {@link createServer}, which calls this with a freshly-resolved
 * {@link ConfigResult} per request. The sync signature is also a structural
 * guard behind #663 — a sync builder cannot `await resolveConfig(...)`, so a
 * caller physically cannot smuggle a second, divergent config resolution into
 * the client factory.
 */
export type BuildClient = (config: ConfigResult) => HttpClient;

/**
 * Resolve config through the server's single resolution authority. The optional
 * `profile` (the `diagnose` tool argument) overrides the launch profile for one
 * call. Re-resolves on every call — never frozen — so mid-session OAuth-token
 * refreshes (persisted to the loaded config file) are picked up.
 */
export type ConfigResolver = (profile?: string) => Promise<ConfigResult>;

export interface CreateServerOptions {
  /**
   * Builds the data-tool client from a resolved config. REQUIRED: there is no
   * credential-less server, so omitting the factory is a wiring bug — now a
   * compile error at the call site rather than a throw on the first tool call.
   */
  readonly buildClient: BuildClient;

  /**
   * Base config-resolution selection captured at server launch. {@link createServer}
   * builds the ONE resolver that BOTH the data-tool `getClient` and the
   * `diagnose` tool resolve through, so they cannot diverge on which config file
   * to load — retiring the #658→#661 bug-class structurally (#663).
   *
   * Omitted only when there is no selection to thread — e.g. standalone
   * `qontoctl-mcp` started with `QONTOCTL_CONFIG_FILE` unset — in which case the
   * resolver live-reads `process.env` on every call (via `resolveConfig`'s
   * `path > QONTOCTL_CONFIG_FILE > profile > home` precedence), keeping the data
   * tools and `diagnose` in lockstep (#661).
   */
  readonly resolveOptions?: ServerConfigSelection;
}

export function createServer(options: CreateServerOptions): McpServer {
  const server = new McpServer({
    name: "qontoctl",
    version: packageJson.version,
  });

  // THE single config-resolution authority for this server. Both the data-tool
  // getClient and the diagnose tool resolve through this one closure — nothing
  // else in the server calls resolveConfig — so the two cannot resolve
  // different config files (#663). Re-resolves per call (never frozen) so
  // mid-session OAuth-token refreshes are picked up; an explicit `profile`
  // (diagnose's tool argument) overrides the launch profile for that one call.
  const resolve: ConfigResolver = (profile?: string) =>
    resolveConfig({
      ...(options.resolveOptions ?? {}),
      ...(profile !== undefined ? { profile } : {}),
    });

  const getClient = async (): Promise<HttpClient> => options.buildClient(await resolve());

  registerAttachmentTools(server, getClient);
  registerAccountTools(server, getClient);
  registerBeneficiaryTools(server, getClient);
  registerCardTools(server, getClient);
  registerBulkTransferTools(server, getClient);
  registerClientTools(server, getClient);
  registerClientInvoiceTools(server, getClient);
  registerCreditNoteTools(server, getClient);
  // diagnose resolves through the SAME `resolve` closure as the data tools —
  // it is handed the resolver, not a selection it could re-derive, so it cannot
  // diverge (#663). The scalar launch profile is passed only for the report's
  // active-profile label (diagnose has no other use for the raw selection).
  registerDiagnoseTools(server, resolve, options.resolveOptions?.profile);
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
