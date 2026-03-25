// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

const samplePaymentLink = {
  id: "pl-uuid-1",
  status: "open",
  expiration_date: "2026-06-01T00:00:00.000Z",
  potential_payment_methods: ["credit_card", "apple_pay"],
  amount: { value: "50.00", currency: "EUR" },
  resource_type: "Basket",
  items: [
    {
      title: "Widget",
      quantity: 2,
      unit_price: { value: "25.00", currency: "EUR" },
      vat_rate: "20.0",
    },
  ],
  reusable: false,
  invoice_id: null,
  invoice_number: null,
  debitor_name: null,
  created_at: "2026-01-15T10:00:00.000Z",
  url: "https://pay.qonto.com/pl-uuid-1",
};

const samplePayment = {
  id: "pay-uuid-1",
  amount: { value: "50.00", currency: "EUR" },
  status: "paid",
  created_at: "2026-01-16T12:00:00.000Z",
  payment_method: "credit_card",
  paid_at: "2026-01-16T12:05:00.000Z",
  debitor_email: "customer@example.com",
};

const samplePaymentMethod = { name: "credit_card", enabled: true };

const sampleConnection = {
  connection_location: "https://connect.provider.com/setup",
  status: "enabled",
  bank_account_id: "ba-uuid-1",
};

const meta = {
  current_page: 1,
  next_page: null,
  prev_page: null,
  total_pages: 1,
  total_count: 1,
  per_page: 100,
};

describe("payment-link MCP tools", () => {
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

  describe("payment_link_list", () => {
    it("returns payment links from API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          payment_links: [samplePaymentLink],
          meta,
        }),
      );

      const result = await mcpClient.callTool({
        name: "payment_link_list",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { payment_links: unknown[]; meta: unknown };
      expect(parsed.payment_links).toHaveLength(1);
      expect(parsed.meta).toBeDefined();
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          payment_links: [],
          meta,
        }),
      );

      await mcpClient.callTool({
        name: "payment_link_list",
        arguments: {},
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/payment_links");
    });
  });

  describe("payment_link_show", () => {
    it("returns a single payment link", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ payment_link: samplePaymentLink }));

      const result = await mcpClient.callTool({
        name: "payment_link_show",
        arguments: { id: "pl-uuid-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string; status: string };
      expect(parsed.id).toBe("pl-uuid-1");
      expect(parsed.status).toBe("open");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ payment_link: samplePaymentLink }));

      await mcpClient.callTool({
        name: "payment_link_show",
        arguments: { id: "pl-uuid-1" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/payment_links/pl-uuid-1");
    });
  });

  describe("payment_link_create", () => {
    it("creates a payment link and returns the result", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ payment_link: samplePaymentLink }));

      const result = await mcpClient.callTool({
        name: "payment_link_create",
        arguments: {
          payment_link: {
            potential_payment_methods: ["credit_card"],
            items: [
              {
                title: "Widget",
                quantity: 2,
                unit_price: { value: "25.00", currency: "EUR" },
                vat_rate: "20.0",
              },
            ],
            reusable: false,
          },
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string };
      expect(parsed.id).toBe("pl-uuid-1");
    });

    it("sends POST to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ payment_link: samplePaymentLink }));

      await mcpClient.callTool({
        name: "payment_link_create",
        arguments: {
          payment_link: {
            potential_payment_methods: ["credit_card"],
            items: [
              {
                title: "Widget",
                quantity: 2,
                unit_price: { value: "25.00", currency: "EUR" },
                vat_rate: "20.0",
              },
            ],
            reusable: false,
          },
        },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/payment_links");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toHaveProperty("payment_link");
    });
  });

  describe("payment_link_deactivate", () => {
    it("deactivates a payment link and returns the result", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({ payment_link: { ...samplePaymentLink, status: "canceled" } }),
      );

      const result = await mcpClient.callTool({
        name: "payment_link_deactivate",
        arguments: { id: "pl-uuid-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string; status: string };
      expect(parsed.id).toBe("pl-uuid-1");
      expect(parsed.status).toBe("canceled");
    });

    it("sends PATCH to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({ payment_link: { ...samplePaymentLink, status: "canceled" } }),
      );

      await mcpClient.callTool({
        name: "payment_link_deactivate",
        arguments: { id: "pl-uuid-1" },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/payment_links/pl-uuid-1/deactivate");
      expect(opts.method).toBe("PATCH");
    });
  });

  describe("payment_link_payments", () => {
    it("returns payments for a payment link", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          payments: [samplePayment],
          meta,
        }),
      );

      const result = await mcpClient.callTool({
        name: "payment_link_payments",
        arguments: { id: "pl-uuid-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { payments: unknown[]; meta: unknown };
      expect(parsed.payments).toHaveLength(1);
      expect(parsed.meta).toBeDefined();
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          payments: [],
          meta,
        }),
      );

      await mcpClient.callTool({
        name: "payment_link_payments",
        arguments: { id: "pl-uuid-1" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/payment_links/pl-uuid-1/payments");
    });
  });

  describe("payment_link_methods", () => {
    it("returns available payment methods", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          payment_link_payment_methods: [samplePaymentMethod],
        }),
      );

      const result = await mcpClient.callTool({
        name: "payment_link_methods",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { name: string; enabled: boolean }[];
      expect(parsed).toHaveLength(1);
      const first_method = parsed[0] as { name: string; enabled: boolean };
      expect(first_method.name).toBe("credit_card");
      expect(first_method.enabled).toBe(true);
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          payment_link_payment_methods: [samplePaymentMethod],
        }),
      );

      await mcpClient.callTool({
        name: "payment_link_methods",
        arguments: {},
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/payment_links/payment_methods");
    });
  });

  describe("payment_link_connect", () => {
    it("establishes a connection and returns the result", async () => {
      fetchSpy.mockReturnValue(jsonResponse(sampleConnection));

      const result = await mcpClient.callTool({
        name: "payment_link_connect",
        arguments: {
          partner_callback_url: "https://example.com/callback",
          user_bank_account_id: "ba-uuid-1",
          user_phone_number: "+33612345678",
          user_website_url: "https://example.com",
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { connection_location: string; status: string };
      expect(parsed.connection_location).toBe("https://connect.provider.com/setup");
      expect(parsed.status).toBe("enabled");
    });

    it("sends POST to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse(sampleConnection));

      await mcpClient.callTool({
        name: "payment_link_connect",
        arguments: {
          partner_callback_url: "https://example.com/callback",
          user_bank_account_id: "ba-uuid-1",
          user_phone_number: "+33612345678",
          user_website_url: "https://example.com",
        },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/payment_links/connections");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toHaveProperty("partner_callback_url", "https://example.com/callback");
      expect(body).toHaveProperty("user_bank_account_id", "ba-uuid-1");
      expect(body).toHaveProperty("user_phone_number", "+33612345678");
      expect(body).toHaveProperty("user_website_url", "https://example.com");
    });
  });

  describe("payment_link_connection_status", () => {
    it("returns connection status", async () => {
      fetchSpy.mockReturnValue(jsonResponse(sampleConnection));

      const result = await mcpClient.callTool({
        name: "payment_link_connection_status",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as {
        connection_location: string;
        status: string;
        bank_account_id: string;
      };
      expect(parsed.connection_location).toBe("https://connect.provider.com/setup");
      expect(parsed.status).toBe("enabled");
      expect(parsed.bank_account_id).toBe("ba-uuid-1");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse(sampleConnection));

      await mcpClient.callTool({
        name: "payment_link_connection_status",
        arguments: {},
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/payment_links/connections");
    });
  });
});
