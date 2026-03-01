// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

const sampleQuote = {
  id: "q-123",
  organization_id: "org-1",
  number: "Q-001",
  status: "pending_approval",
  currency: "EUR",
  total_amount: { value: "120.00", currency: "EUR" },
  total_amount_cents: 12000,
  vat_amount: { value: "20.00", currency: "EUR" },
  vat_amount_cents: 2000,
  issue_date: "2026-01-15",
  expiry_date: "2026-02-15",
  created_at: "2026-01-15T10:00:00Z",
  approved_at: null,
  canceled_at: null,
  attachment_id: null,
  quote_url: null,
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
      total_amount: { value: "120.00", currency: "EUR" },
      total_amount_cents: 12000,
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
  invoice_ids: [],
};

describe("quote MCP tools", () => {
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

  describe("quote_list", () => {
    it("returns quotes from API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          quotes: [sampleQuote],
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
        name: "quote_list",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { quotes: unknown[] };
      expect(parsed.quotes).toHaveLength(1);
    });

    it("passes filter params to API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          quotes: [],
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
        name: "quote_list",
        arguments: {
          status: "approved",
          created_at_from: "2026-01-01",
          created_at_to: "2026-12-31",
          sort_by: "created_at:desc",
          current_page: 2,
          per_page: 10,
        },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("filter[status]")).toBe("approved");
      expect(url.searchParams.get("filter[created_at_from]")).toBe("2026-01-01");
      expect(url.searchParams.get("filter[created_at_to]")).toBe("2026-12-31");
      expect(url.searchParams.get("sort_by")).toBe("created_at:desc");
      expect(url.searchParams.get("current_page")).toBe("2");
      expect(url.searchParams.get("per_page")).toBe("10");
    });
  });

  describe("quote_show", () => {
    it("returns a single quote", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ quote: sampleQuote }));

      const result = await mcpClient.callTool({
        name: "quote_show",
        arguments: { id: "q-123" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string };
      expect(parsed.id).toBe("q-123");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ quote: sampleQuote }));

      await mcpClient.callTool({
        name: "quote_show",
        arguments: { id: "q-123" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/quotes/q-123");
    });
  });

  describe("quote_create", () => {
    it("creates a quote and returns the result", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ quote: sampleQuote }));

      const result = await mcpClient.callTool({
        name: "quote_create",
        arguments: {
          client_id: "c-456",
          issue_date: "2026-01-15",
          expiry_date: "2026-02-15",
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
      expect(parsed.id).toBe("q-123");
    });

    it("sends POST to the correct endpoint with body", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ quote: sampleQuote }));

      await mcpClient.callTool({
        name: "quote_create",
        arguments: {
          client_id: "c-456",
          issue_date: "2026-01-15",
          expiry_date: "2026-02-15",
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
          number: "Q-001",
          header: "Header",
          footer: "Footer",
          discount: { type: "percentage", value: "10" },
        },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/quotes");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toHaveProperty("client_id", "c-456");
      expect(body).toHaveProperty("number", "Q-001");
      expect(body).toHaveProperty("header", "Header");
      expect(body).toHaveProperty("footer", "Footer");
      expect(body).toHaveProperty("discount");
    });
  });

  describe("quote_update", () => {
    it("updates a quote and returns the result", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ quote: { ...sampleQuote, header: "Updated" } }));

      const result = await mcpClient.callTool({
        name: "quote_update",
        arguments: {
          id: "q-123",
          header: "Updated",
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string; header: string };
      expect(parsed.id).toBe("q-123");
    });

    it("sends PATCH to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ quote: sampleQuote }));

      await mcpClient.callTool({
        name: "quote_update",
        arguments: {
          id: "q-123",
          header: "Updated",
        },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/quotes/q-123");
      expect(opts.method).toBe("PATCH");
    });
  });

  describe("quote_delete", () => {
    it("deletes a quote and returns confirmation", async () => {
      fetchSpy.mockReturnValue(new Response(null, { status: 204 }));

      const result = await mcpClient.callTool({
        name: "quote_delete",
        arguments: { id: "q-123" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { deleted: boolean; id: string };
      expect(parsed.deleted).toBe(true);
      expect(parsed.id).toBe("q-123");
    });

    it("sends DELETE to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(new Response(null, { status: 204 }));

      await mcpClient.callTool({
        name: "quote_delete",
        arguments: { id: "q-123" },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/quotes/q-123");
      expect(opts.method).toBe("DELETE");
    });
  });
});
