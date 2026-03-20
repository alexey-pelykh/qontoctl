// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

function makeMeta(overrides: Record<string, unknown> = {}) {
  return {
    current_page: 1,
    next_page: null,
    prev_page: null,
    total_pages: 1,
    total_count: 1,
    per_page: 100,
    ...overrides,
  };
}

const amount = { value: "100.00", currency: "EUR" };

const item = {
  title: "Consulting",
  description: "Strategy consulting",
  quantity: "2",
  unit: "hours",
  unit_price: amount,
  unit_price_cents: 10000,
  vat_rate: "20.0",
  total_vat: amount,
  total_vat_cents: 4000,
  total_amount: amount,
  total_amount_cents: 20000,
  subtotal: amount,
  subtotal_cents: 20000,
};

const client = {
  id: "client-1",
  name: "ACME Corp",
  first_name: "John",
  last_name: "Doe",
  type: "company",
  email: "contact@acme.com",
  vat_number: "FR12345678901",
  tax_identification_number: "12345",
  address: "123 Main St",
  city: "Paris",
  zip_code: "75001",
  country_code: "FR",
  locale: "fr",
};

function makeCreditNote(overrides: Record<string, unknown> = {}) {
  return {
    id: "cn-1",
    invoice_id: "inv-1",
    attachment_id: "att-1",
    number: "CN-2024-001",
    issue_date: "2024-06-01",
    invoice_issue_date: "2024-05-01",
    header: "Credit Note",
    footer: "Thank you",
    terms_and_conditions: "Standard terms",
    currency: "EUR",
    vat_amount: amount,
    vat_amount_cents: 4000,
    total_amount: amount,
    total_amount_cents: 20000,
    stamp_duty_amount: "0",
    created_at: "2024-06-01T00:00:00.000Z",
    finalized_at: "2024-06-01T12:00:00.000Z",
    contact_email: "contact@acme.com",
    invoice_url: "https://example.com/invoice.pdf",
    einvoicing_status: "not_applicable",
    items: [item],
    client,
    ...overrides,
  };
}

describe("credit-note MCP tools", () => {
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

  describe("credit_note_list", () => {
    it("returns credit notes from API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          credit_notes: [makeCreditNote()],
          meta: makeMeta(),
        }),
      );

      const result = await mcpClient.callTool({
        name: "credit_note_list",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as {
        credit_notes: { id: string }[];
      };
      expect(parsed.credit_notes).toHaveLength(1);
      expect(parsed.credit_notes[0]?.id).toBe("cn-1");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          credit_notes: [],
          meta: makeMeta({ total_count: 0 }),
        }),
      );

      await mcpClient.callTool({
        name: "credit_note_list",
        arguments: {},
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/credit_notes");
    });

    it("passes pagination parameters", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          credit_notes: [],
          meta: makeMeta({ current_page: 2, total_pages: 3, total_count: 10 }),
        }),
      );

      await mcpClient.callTool({
        name: "credit_note_list",
        arguments: { current_page: 2, per_page: 5 },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("current_page")).toBe("2");
      expect(url.searchParams.get("per_page")).toBe("5");
    });
  });

  describe("credit_note_show", () => {
    it("returns a single credit note", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          credit_note: makeCreditNote(),
        }),
      );

      const result = await mcpClient.callTool({
        name: "credit_note_show",
        arguments: { id: "cn-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as { id: string };
      expect(parsed.id).toBe("cn-1");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          credit_note: makeCreditNote(),
        }),
      );

      await mcpClient.callTool({
        name: "credit_note_show",
        arguments: { id: "cn-1" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/credit_notes/cn-1");
    });
  });
});
