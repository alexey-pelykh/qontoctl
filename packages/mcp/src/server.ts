// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { HttpClient } from "@qontoctl/core";
import {
  registerAccountTools,
  registerLabelTools,
  registerMembershipTools,
  registerOrgTools,
  registerStatementTools,
  registerTransactionTools,
} from "./tools/index.js";

export interface CreateServerOptions {
  readonly getClient: () => Promise<HttpClient>;
}

export function createServer(options?: CreateServerOptions): McpServer {
  const server = new McpServer({
    name: "qontoctl",
    version: "0.0.0",
  });

  if (options?.getClient !== undefined) {
    registerAccountTools(server, options.getClient);
    registerLabelTools(server, options.getClient);
    registerMembershipTools(server, options.getClient);
    registerOrgTools(server, options.getClient);
    registerStatementTools(server, options.getClient);
    registerTransactionTools(server, options.getClient);
  }

  return server;
}
