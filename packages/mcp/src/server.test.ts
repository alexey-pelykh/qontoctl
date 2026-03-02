// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { connectInMemory } from "./testing/mcp-helpers.js";
import { createServer } from "./server.js";

describe("createServer", () => {
  it("returns an McpServer instance", () => {
    const server = createServer();
    expect(server).toBeDefined();
    expect(typeof server.connect).toBe("function");
    expect(typeof server.close).toBe("function");
  });

  describe("tool registration (via InMemoryTransport)", () => {
    let mcpClient: Client;

    beforeEach(async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal("fetch", fetchSpy);
      ({ mcpClient } = await connectInMemory(fetchSpy));
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("registers all 58 expected tools", async () => {
      const { tools } = await mcpClient.listTools();
      const toolNames = tools.map((t) => t.name);

      expect(toolNames).toContain("org_show");
      expect(toolNames).toContain("account_list");
      expect(toolNames).toContain("account_show");
      expect(toolNames).toContain("account_iban_certificate");
      expect(toolNames).toContain("beneficiary_list");
      expect(toolNames).toContain("beneficiary_show");
      expect(toolNames).toContain("bulk_transfer_list");
      expect(toolNames).toContain("bulk_transfer_show");
      expect(toolNames).toContain("client_list");
      expect(toolNames).toContain("client_show");
      expect(toolNames).toContain("client_create");
      expect(toolNames).toContain("client_update");
      expect(toolNames).toContain("client_delete");
      expect(toolNames).toContain("client_invoice_list");
      expect(toolNames).toContain("client_invoice_show");
      expect(toolNames).toContain("client_invoice_create");
      expect(toolNames).toContain("client_invoice_update");
      expect(toolNames).toContain("client_invoice_delete");
      expect(toolNames).toContain("client_invoice_finalize");
      expect(toolNames).toContain("client_invoice_send");
      expect(toolNames).toContain("client_invoice_mark_paid");
      expect(toolNames).toContain("client_invoice_unmark_paid");
      expect(toolNames).toContain("client_invoice_cancel");
      expect(toolNames).toContain("client_invoice_upload");
      expect(toolNames).toContain("client_invoice_upload_show");
      expect(toolNames).toContain("credit_note_list");
      expect(toolNames).toContain("credit_note_show");
      expect(toolNames).toContain("einvoicing_settings");
      expect(toolNames).toContain("internal_transfer_create");
      expect(toolNames).toContain("recurring_transfer_list");
      expect(toolNames).toContain("recurring_transfer_show");
      expect(toolNames).toContain("transaction_list");
      expect(toolNames).toContain("transaction_show");
      expect(toolNames).toContain("transfer_list");
      expect(toolNames).toContain("transfer_show");
      expect(toolNames).toContain("statement_list");
      expect(toolNames).toContain("statement_show");
      expect(toolNames).toContain("label_list");
      expect(toolNames).toContain("label_show");
      expect(toolNames).toContain("membership_list");
      expect(toolNames).toContain("quote_list");
      expect(toolNames).toContain("quote_show");
      expect(toolNames).toContain("quote_create");
      expect(toolNames).toContain("quote_update");
      expect(toolNames).toContain("quote_delete");
      expect(toolNames).toContain("quote_send");
      expect(toolNames).toContain("request_list");
      expect(toolNames).toContain("supplier_invoice_list");
      expect(toolNames).toContain("supplier_invoice_show");
      expect(toolNames).toContain("supplier_invoice_bulk_create");
      expect(toolNames).toContain("attachment_upload");
      expect(toolNames).toContain("attachment_show");
      expect(toolNames).toContain("transaction_attachment_list");
      expect(toolNames).toContain("transaction_attachment_add");
      expect(toolNames).toContain("transaction_attachment_remove");
      expect(toolNames).toContain("account_create");
      expect(toolNames).toContain("account_update");
      expect(toolNames).toContain("account_close");
      expect(tools).toHaveLength(58);
    });

    it("tools have descriptions", async () => {
      const { tools } = await mcpClient.listTools();

      for (const tool of tools) {
        expect(tool.description, `Tool ${tool.name} should have a description`).toBeTruthy();
      }
    });

    it("tool names follow entity_operation underscore convention", async () => {
      const { tools } = await mcpClient.listTools();

      const pattern = /^[a-z]+(?:_[a-z]+)+$/;
      for (const tool of tools) {
        expect(tool.name, `Tool "${tool.name}" should match {entity}_{operation} pattern`).toMatch(pattern);
      }
    });
  });
});
