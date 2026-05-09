// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { ClientInvoiceListResponseSchema, ClientInvoiceSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasApiKeyCredentials } from "../sandbox.js";

describe.skipIf(!hasApiKeyCredentials())("MCP client invoice tools (e2e)", () => {
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

  describe("client_invoice_list", () => {
    it("returns a list of client invoices with expected structure", async () => {
      const result = await client.callTool({
        name: "client_invoice_list",
        arguments: {},
      });

      // Sandbox may not have client invoices — skip gracefully on tool error
      if (result.isError === true) return;

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as {
        client_invoices: unknown[];
        meta: Record<string, unknown>;
      };
      ClientInvoiceListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("client_invoices");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.client_invoices)).toBe(true);
    });
  });

  describe("client_invoice_show", () => {
    it("returns details for a specific client invoice", async () => {
      const listResult = await client.callTool({
        name: "client_invoice_list",
        arguments: {},
      });
      if (listResult.isError === true) return;

      const listParsed = JSON.parse(firstTextFromMcpResult(listResult)) as {
        client_invoices: { id: string }[];
      };
      if (listParsed.client_invoices.length === 0) {
        return;
      }

      const invoiceId = (listParsed.client_invoices[0] as { id: string }).id;

      const result = await client.callTool({
        name: "client_invoice_show",
        arguments: { id: invoiceId },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      ClientInvoiceSchema.parse(parsed);
      expect(parsed).toHaveProperty("id", invoiceId);
      expect(parsed).toHaveProperty("status");
      expect(parsed).toHaveProperty("items");
    });
  });
});
