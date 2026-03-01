// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn().mockResolvedValue(Buffer.from("fake-pdf-content")),
}));

describe("supplier-invoice MCP tools", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let mcpClient: Client;

  beforeEach(async () => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    ({ mcpClient } = await connectInMemory(fetchSpy));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("supplier_invoice_list", () => {
    it("returns supplier invoices from API", async () => {
      const supplier_invoices = [
        {
          id: "inv-1",
          supplier_name: "Acme Corp",
          invoice_number: "INV-001",
          status: "paid",
          total_amount: { value: "100.00", currency: "EUR" },
          due_date: "2026-04-01",
          issue_date: "2026-03-01",
          payment_date: "2026-03-15",
          file_name: "invoice.pdf",
          is_einvoice: false,
          created_at: "2026-03-01T00:00:00.000Z",
          self: "https://thirdparty.qonto.com/v2/supplier_invoices/inv-1",
        },
      ];
      fetchSpy.mockReturnValue(
        jsonResponse({
          supplier_invoices,
          meta: {
            current_page: 1,
            next_page: null,
            prev_page: null,
            total_pages: 1,
            total_count: 1,
            per_page: 100,
          },
        }),
      );

      const result = await mcpClient.callTool({
        name: "supplier_invoice_list",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { supplier_invoices: unknown[] };
      expect(parsed.supplier_invoices).toHaveLength(1);
    });

    it("passes filter and pagination params to API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          supplier_invoices: [],
          meta: {
            current_page: 2,
            next_page: null,
            prev_page: 1,
            total_pages: 2,
            total_count: 0,
            per_page: 10,
          },
        }),
      );

      await mcpClient.callTool({
        name: "supplier_invoice_list",
        arguments: { status: "paid", current_page: 2, per_page: 10 },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("filter[status][]")).toBe("paid");
      expect(url.searchParams.get("current_page")).toBe("2");
      expect(url.searchParams.get("per_page")).toBe("10");
    });

    it("passes optional query and sort params", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          supplier_invoices: [],
          meta: {
            current_page: 1,
            next_page: null,
            prev_page: null,
            total_pages: 1,
            total_count: 0,
            per_page: 100,
          },
        }),
      );

      await mcpClient.callTool({
        name: "supplier_invoice_list",
        arguments: { query: "acme", sort_by: "created_at:desc", due_date: "future" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("query")).toBe("acme");
      expect(url.searchParams.get("sort_by")).toBe("created_at:desc");
      expect(url.searchParams.get("filter[due_date]")).toBe("future");
    });
  });

  describe("supplier_invoice_show", () => {
    it("returns a single supplier invoice", async () => {
      const supplier_invoice = {
        id: "inv-1",
        supplier_name: "Acme Corp",
        invoice_number: "INV-001",
        status: "paid",
        total_amount: { value: "100.00", currency: "EUR" },
        due_date: "2026-04-01",
        issue_date: "2026-03-01",
        payment_date: "2026-03-15",
        file_name: "invoice.pdf",
        is_einvoice: false,
        created_at: "2026-03-01T00:00:00.000Z",
        self: "https://thirdparty.qonto.com/v2/supplier_invoices/inv-1",
      };
      fetchSpy.mockReturnValue(jsonResponse({ supplier_invoice }));

      const result = await mcpClient.callTool({
        name: "supplier_invoice_show",
        arguments: { id: "inv-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string; supplier_name: string };
      expect(parsed.id).toBe("inv-1");
      expect(parsed.supplier_name).toBe("Acme Corp");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          supplier_invoice: {
            id: "inv-1",
            supplier_name: "Test",
            invoice_number: null,
            status: "to_review",
            total_amount: null,
            due_date: null,
            issue_date: null,
            payment_date: null,
            file_name: "test.pdf",
            is_einvoice: false,
            created_at: "2026-03-01T00:00:00.000Z",
            self: "https://thirdparty.qonto.com/v2/supplier_invoices/inv-1",
          },
        }),
      );

      await mcpClient.callTool({
        name: "supplier_invoice_show",
        arguments: { id: "inv-1" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/supplier_invoices/inv-1");
    });
  });

  describe("supplier_invoice_bulk_create", () => {
    it("reads files and sends FormData to API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          supplier_invoices: [
            {
              id: "new-inv-1",
              supplier_name: null,
              invoice_number: null,
              status: "to_review",
              total_amount: null,
              due_date: null,
              issue_date: null,
              payment_date: null,
              file_name: "invoice.pdf",
              is_einvoice: false,
              created_at: "2026-03-01T00:00:00.000Z",
              self: "https://thirdparty.qonto.com/v2/supplier_invoices/new-inv-1",
            },
          ],
          errors: [],
        }),
      );

      const result = await mcpClient.callTool({
        name: "supplier_invoice_bulk_create",
        arguments: { file_paths: ["/tmp/invoice.pdf"] },
      });

      expect(result.isError).toBeFalsy();
      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { supplier_invoices: unknown[]; errors: unknown[] };
      expect(parsed.supplier_invoices).toHaveLength(1);
      expect(parsed.errors).toHaveLength(0);
    });

    it("sends request to bulk endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          supplier_invoices: [],
          errors: [],
        }),
      );

      await mcpClient.callTool({
        name: "supplier_invoice_bulk_create",
        arguments: { file_paths: ["/tmp/invoice.pdf"] },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/supplier_invoices/bulk");
    });
  });
});
