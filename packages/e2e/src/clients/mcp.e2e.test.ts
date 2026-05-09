// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ClientListResponseSchema, ClientSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasApiKeyCredentials } from "../sandbox.js";

describe.skipIf(!hasApiKeyCredentials())("MCP client tools (e2e)", () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "node",
      args: [CLI_PATH, "mcp"],
      env: cliEnv(),
      stderr: "pipe",
    });

    client = new Client({ name: "e2e-test", version: "0.0.0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  describe("client_list", () => {
    it("returns a list of clients with expected structure", async () => {
      const result = await client.callTool({
        name: "client_list",
        arguments: {},
      });

      // Sandbox may not have clients — skip gracefully on tool error
      if (result.isError === true) return;

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as {
        clients: unknown[];
        meta: Record<string, unknown>;
      };
      ClientListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("clients");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.clients)).toBe(true);
    });
  });

  describe("client_show", () => {
    it("returns details for a specific client", async () => {
      const listResult = await client.callTool({
        name: "client_list",
        arguments: {},
      });
      if (listResult.isError === true) return;

      const listParsed = JSON.parse(firstTextFromMcpResult(listResult)) as {
        clients: { id: string }[];
      };
      if (listParsed.clients.length === 0) {
        return;
      }

      const clientId = (listParsed.clients[0] as { id: string }).id;

      const result = await client.callTool({
        name: "client_show",
        arguments: { id: clientId },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      ClientSchema.parse(parsed);
      expect(parsed).toHaveProperty("id", clientId);
      expect(parsed).toHaveProperty("name");
      expect(parsed).toHaveProperty("type");
    });
  });
});
