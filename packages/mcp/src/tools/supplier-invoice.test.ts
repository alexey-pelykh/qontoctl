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
          organization_id: "org-1",
          status: "paid",
          source_type: "email",
          source: "supplier@example.com",
          attachment_id: "att-1",
          display_attachment_id: "datt-1",
          file_name: "invoice.pdf",
          invoice_number: "INV-001",
          supplier_name: "Acme Corp",
          total_amount: { value: "100.00", currency: "EUR" },
          total_amount_excluding_taxes: null,
          total_tax_amount: null,
          payable_amount: null,
          issue_date: "2026-03-01",
          due_date: "2026-04-01",
          payment_date: "2026-03-15",
          scheduled_date: null,
          iban: null,
          is_einvoice: false,
          created_at: "2026-03-01T00:00:00.000Z",
          updated_at: "2026-03-01T00:00:00.000Z",
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
        arguments: { status: "paid", page: 2, per_page: 10 },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("filter[status][]")).toBe("paid");
      expect(url.searchParams.get("page")).toBe("2");
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

    it("passes new filter params to API", async () => {
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
        arguments: {
          attachment_id: "att-1",
          payment_date: "2026-03-15",
          issue_date: "2026-03-01",
          issue_date_from: "2026-01-01",
          missing_data: true,
          matched_transactions: false,
          document_type: "invoice",
          exclude_credit_notes: true,
          payable_amount: "100.00",
          query_fields: "supplier_name",
        },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("filter[attachment_id]")).toBe("att-1");
      expect(url.searchParams.get("filter[payment_date]")).toBe("2026-03-15");
      expect(url.searchParams.get("filter[issue_date]")).toBe("2026-03-01");
      expect(url.searchParams.get("filter[issue_date_from]")).toBe("2026-01-01");
      expect(url.searchParams.get("filter[missing_data]")).toBe("true");
      expect(url.searchParams.get("filter[matched_transactions]")).toBe("false");
      expect(url.searchParams.get("filter[document_type]")).toBe("invoice");
      expect(url.searchParams.get("filter[exclude_credit_notes]")).toBe("true");
      expect(url.searchParams.get("filter[payable_amount]")).toBe("100.00");
      expect(url.searchParams.get("query_fields")).toBe("supplier_name");
    });
  });

  describe("supplier_invoice_show", () => {
    it("returns a single supplier invoice", async () => {
      const supplier_invoice = {
        id: "inv-1",
        organization_id: "org-1",
        status: "paid",
        source_type: "email",
        source: "supplier@example.com",
        attachment_id: "att-1",
        display_attachment_id: "datt-1",
        file_name: "invoice.pdf",
        invoice_number: "INV-001",
        supplier_name: "Acme Corp",
        total_amount: { value: "100.00", currency: "EUR" },
        total_amount_excluding_taxes: null,
        total_tax_amount: null,
        payable_amount: null,
        issue_date: "2026-03-01",
        due_date: "2026-04-01",
        payment_date: "2026-03-15",
        scheduled_date: null,
        iban: null,
        is_einvoice: false,
        created_at: "2026-03-01T00:00:00.000Z",
        updated_at: "2026-03-01T00:00:00.000Z",
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
            organization_id: "org-1",
            status: "to_review",
            source_type: "email",
            source: "test@example.com",
            attachment_id: "att-1",
            display_attachment_id: "datt-1",
            file_name: "test.pdf",
            invoice_number: null,
            supplier_name: "Test",
            total_amount: null,
            total_amount_excluding_taxes: null,
            total_tax_amount: null,
            payable_amount: null,
            issue_date: null,
            due_date: null,
            payment_date: null,
            scheduled_date: null,
            iban: null,
            is_einvoice: false,
            created_at: "2026-03-01T00:00:00.000Z",
            updated_at: "2026-03-01T00:00:00.000Z",
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
              organization_id: "org-1",
              status: "to_review",
              source_type: "api",
              source: "api-upload",
              attachment_id: "att-1",
              display_attachment_id: "datt-1",
              file_name: "invoice.pdf",
              invoice_number: null,
              supplier_name: null,
              total_amount: null,
              total_amount_excluding_taxes: null,
              total_tax_amount: null,
              payable_amount: null,
              issue_date: null,
              due_date: null,
              payment_date: null,
              scheduled_date: null,
              iban: null,
              is_einvoice: false,
              created_at: "2026-03-01T00:00:00.000Z",
              updated_at: "2026-03-01T00:00:00.000Z",
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
