// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SupplierInvoiceListResponseSchema, SupplierInvoiceSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cliEnv, hasCredentials } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

function firstText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as { type: string; text: string }[];
  expect(content).toHaveLength(1);
  const entry = content[0] as { type: string; text: string };
  expect(entry.type).toBe("text");
  return entry.text;
}

describe.skipIf(!hasCredentials())("MCP supplier invoice tools (e2e)", () => {
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

  describe("supplier_invoice_list", () => {
    it("returns a list of supplier invoices with expected structure", async () => {
      const result = await client.callTool({
        name: "supplier_invoice_list",
        arguments: {},
      });

      const parsed = JSON.parse(firstText(result)) as {
        supplier_invoices: unknown[];
        meta: Record<string, unknown>;
      };
      SupplierInvoiceListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("supplier_invoices");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.supplier_invoices)).toBe(true);

      for (const item of parsed.supplier_invoices) {
        const invoice = item as Record<string, unknown>;
        expect(invoice).toHaveProperty("id");
        expect(invoice).toHaveProperty("status");
      }
    });
  });

  describe("supplier_invoice_show", () => {
    it("returns details for a specific supplier invoice", async () => {
      const listResult = await client.callTool({
        name: "supplier_invoice_list",
        arguments: {},
      });
      const listParsed = JSON.parse(firstText(listResult)) as {
        supplier_invoices: { id: string }[];
      };
      if (listParsed.supplier_invoices.length === 0) {
        return; // No supplier invoices available
      }

      const firstInvoice = listParsed.supplier_invoices[0];
      expect(firstInvoice).toBeDefined();
      const invoiceId = (firstInvoice as { id: string }).id;

      const result = await client.callTool({
        name: "supplier_invoice_show",
        arguments: { id: invoiceId },
      });

      const parsed = JSON.parse(firstText(result)) as Record<string, unknown>;
      SupplierInvoiceSchema.parse(parsed);
      expect(parsed).toHaveProperty("id", invoiceId);
      expect(parsed).toHaveProperty("status");
    });
  });
});
