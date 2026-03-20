// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

const sampleClientInvoice = {
  id: "ci-123",
  organization_id: "org-1",
  invoice_number: "INV-001",
  status: "draft",
  client_id: "c-456",
  currency: "EUR",
  total_amount: { value: "120.00", currency: "EUR" },
  total_amount_cents: 12000,
  vat_amount: { value: "20.00", currency: "EUR" },
  vat_amount_cents: 2000,
  issue_date: "2026-01-15",
  due_date: "2026-02-15",
  created_at: "2026-01-15T10:00:00Z",
  updated_at: "2026-01-15T10:00:00Z",
  attachment_id: null,
  contact_email: null,
  terms_and_conditions: "Net 30",
  header: null,
  footer: null,
  discount: null,
  items: [
    {
      title: "Service A",
      description: null,
      quantity: "1",
      unit: null,
      vat_rate: "20",
      vat_exemption_reason: null,
      unit_price: { value: "100.00", currency: "EUR" },
      unit_price_cents: 10000,
      total_amount: { value: "100.00", currency: "EUR" },
      total_amount_cents: 10000,
      total_vat: { value: "20.00", currency: "EUR" },
      total_vat_cents: 2000,
      subtotal: { value: "100.00", currency: "EUR" },
      subtotal_cents: 10000,
      discount: null,
    },
  ],
  client: {
    id: "c-456",
    type: "company",
    name: "Acme Corp",
    first_name: null,
    last_name: null,
    email: null,
    vat_number: null,
    tax_identification_number: null,
    address: null,
    city: null,
    zip_code: null,
    province_code: null,
    country_code: null,
    recipient_code: null,
    locale: null,
    billing_address: null,
    delivery_address: null,
  },
};

const sampleUpload = {
  id: "up-789",
  file_name: "invoice.pdf",
  file_size: 1024,
  file_content_type: "application/pdf",
  url: "https://example.com/invoice.pdf",
  created_at: "2026-01-15T10:00:00Z",
};

describe("client-invoice MCP tools", () => {
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

  describe("client_invoice_list", () => {
    it("returns client invoices from API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          client_invoices: [sampleClientInvoice],
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
        name: "client_invoice_list",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { client_invoices: unknown[] };
      expect(parsed.client_invoices).toHaveLength(1);
    });

    it("passes filter params to API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          client_invoices: [],
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
        name: "client_invoice_list",
        arguments: {
          status: "draft",
          client_id: "c-456",
          current_page: 2,
          per_page: 10,
        },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("filter[status][]")).toBe("draft");
      expect(url.searchParams.get("filter[client_id]")).toBe("c-456");
      expect(url.searchParams.get("current_page")).toBe("2");
      expect(url.searchParams.get("per_page")).toBe("10");
    });
  });

  describe("client_invoice_show", () => {
    it("returns a single client invoice", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleClientInvoice }));

      const result = await mcpClient.callTool({
        name: "client_invoice_show",
        arguments: { id: "ci-123" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string };
      expect(parsed.id).toBe("ci-123");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleClientInvoice }));

      await mcpClient.callTool({
        name: "client_invoice_show",
        arguments: { id: "ci-123" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/client_invoices/ci-123");
    });
  });

  describe("client_invoice_create", () => {
    it("creates a client invoice and returns the result", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleClientInvoice }));

      const result = await mcpClient.callTool({
        name: "client_invoice_create",
        arguments: {
          client_id: "c-456",
          issue_date: "2026-01-15",
          due_date: "2026-02-15",
          currency: "EUR",
          terms_and_conditions: "Net 30",
          items: [
            {
              title: "Service A",
              quantity: "1",
              unit_price: { value: "100.00", currency: "EUR" },
              vat_rate: "20",
            },
          ],
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string };
      expect(parsed.id).toBe("ci-123");
    });

    it("sends POST with body including optional fields", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleClientInvoice }));

      await mcpClient.callTool({
        name: "client_invoice_create",
        arguments: {
          client_id: "c-456",
          issue_date: "2026-01-15",
          due_date: "2026-02-15",
          currency: "EUR",
          terms_and_conditions: "Net 30",
          items: [
            {
              title: "Service A",
              quantity: "1",
              unit_price: { value: "100.00", currency: "EUR" },
              vat_rate: "20",
            },
          ],
          header: "Header",
          footer: "Footer",
          discount: { type: "percentage", value: "10" },
        },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/client_invoices");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toHaveProperty("client_id", "c-456");
      expect(body).toHaveProperty("header", "Header");
      expect(body).toHaveProperty("footer", "Footer");
      expect(body).toHaveProperty("discount");
    });
  });

  describe("client_invoice_update", () => {
    it("updates a client invoice and returns the result", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: { ...sampleClientInvoice, header: "Updated" } }));

      const result = await mcpClient.callTool({
        name: "client_invoice_update",
        arguments: {
          id: "ci-123",
          header: "Updated",
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string };
      expect(parsed.id).toBe("ci-123");
    });

    it("sends PATCH to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: sampleClientInvoice }));

      await mcpClient.callTool({
        name: "client_invoice_update",
        arguments: {
          id: "ci-123",
          header: "Updated",
        },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/client_invoices/ci-123");
      expect(opts.method).toBe("PATCH");
    });
  });

  describe("client_invoice_delete", () => {
    it("deletes a client invoice and returns confirmation", async () => {
      fetchSpy.mockReturnValue(new Response(null, { status: 204 }));

      const result = await mcpClient.callTool({
        name: "client_invoice_delete",
        arguments: { id: "ci-123" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { deleted: boolean; id: string };
      expect(parsed.deleted).toBe(true);
      expect(parsed.id).toBe("ci-123");
    });

    it("sends DELETE to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(new Response(null, { status: 204 }));

      await mcpClient.callTool({
        name: "client_invoice_delete",
        arguments: { id: "ci-123" },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/client_invoices/ci-123");
      expect(opts.method).toBe("DELETE");
    });
  });

  describe("client_invoice_finalize", () => {
    it("finalizes a client invoice and returns the result", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: { ...sampleClientInvoice, status: "pending" } }));

      const result = await mcpClient.callTool({
        name: "client_invoice_finalize",
        arguments: { id: "ci-123" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string; status: string };
      expect(parsed.id).toBe("ci-123");
      expect(parsed.status).toBe("pending");
    });

    it("sends POST to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: { ...sampleClientInvoice, status: "pending" } }));

      await mcpClient.callTool({
        name: "client_invoice_finalize",
        arguments: { id: "ci-123" },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/client_invoices/ci-123/finalize");
      expect(opts.method).toBe("POST");
    });
  });

  describe("client_invoice_send", () => {
    it("sends a client invoice and returns confirmation", async () => {
      fetchSpy.mockReturnValue(new Response(null, { status: 204 }));

      const result = await mcpClient.callTool({
        name: "client_invoice_send",
        arguments: { id: "ci-123" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { sent: boolean; id: string };
      expect(parsed.sent).toBe(true);
      expect(parsed.id).toBe("ci-123");
    });

    it("sends POST to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(new Response(null, { status: 204 }));

      await mcpClient.callTool({
        name: "client_invoice_send",
        arguments: { id: "ci-123" },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/client_invoices/ci-123/send");
      expect(opts.method).toBe("POST");
    });
  });

  describe("client_invoice_mark_paid", () => {
    it("marks a client invoice as paid and returns the result", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: { ...sampleClientInvoice, status: "paid" } }));

      const result = await mcpClient.callTool({
        name: "client_invoice_mark_paid",
        arguments: { id: "ci-123" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string; status: string };
      expect(parsed.id).toBe("ci-123");
      expect(parsed.status).toBe("paid");
    });

    it("sends POST to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: { ...sampleClientInvoice, status: "paid" } }));

      await mcpClient.callTool({
        name: "client_invoice_mark_paid",
        arguments: { id: "ci-123" },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/client_invoices/ci-123/mark_as_paid");
      expect(opts.method).toBe("POST");
    });
  });

  describe("client_invoice_unmark_paid", () => {
    it("unmarks a client invoice paid status and returns the result", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: { ...sampleClientInvoice, status: "pending" } }));

      const result = await mcpClient.callTool({
        name: "client_invoice_unmark_paid",
        arguments: { id: "ci-123" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string; status: string };
      expect(parsed.id).toBe("ci-123");
      expect(parsed.status).toBe("pending");
    });

    it("sends POST to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: { ...sampleClientInvoice, status: "pending" } }));

      await mcpClient.callTool({
        name: "client_invoice_unmark_paid",
        arguments: { id: "ci-123" },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/client_invoices/ci-123/unmark_as_paid");
      expect(opts.method).toBe("POST");
    });
  });

  describe("client_invoice_cancel", () => {
    it("cancels a client invoice and returns the result", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: { ...sampleClientInvoice, status: "cancelled" } }));

      const result = await mcpClient.callTool({
        name: "client_invoice_cancel",
        arguments: { id: "ci-123" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string; status: string };
      expect(parsed.id).toBe("ci-123");
      expect(parsed.status).toBe("cancelled");
    });

    it("sends POST to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ client_invoice: { ...sampleClientInvoice, status: "cancelled" } }));

      await mcpClient.callTool({
        name: "client_invoice_cancel",
        arguments: { id: "ci-123" },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/client_invoices/ci-123/mark_as_canceled");
      expect(opts.method).toBe("POST");
    });
  });

  describe("client_invoice_upload_show", () => {
    it("returns upload details", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ upload: sampleUpload }));

      const result = await mcpClient.callTool({
        name: "client_invoice_upload_show",
        arguments: { id: "ci-123", upload_id: "up-789" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string };
      expect(parsed.id).toBe("up-789");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ upload: sampleUpload }));

      await mcpClient.callTool({
        name: "client_invoice_upload_show",
        arguments: { id: "ci-123", upload_id: "up-789" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/client_invoices/ci-123/uploads/up-789");
    });
  });
});
