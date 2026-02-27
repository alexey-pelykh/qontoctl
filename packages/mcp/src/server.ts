// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { createRequire } from "node:module";
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

  registerAccountTools(server, getClient);
  registerLabelTools(server, getClient);
  registerMembershipTools(server, getClient);
  registerOrgTools(server, getClient);
  registerStatementTools(server, getClient);
  registerTransactionTools(server, getClient);

  return server;
}
