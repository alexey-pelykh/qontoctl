// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

const sampleEligibility = {
  status: "STATUS_INELIGIBLE",
  reason: "REASON_UNKNOWN",
};

const sampleCurrencies = [
  { country_code: "US", currency_code: "USD", suggestion_priority: 6 },
  { country_code: "GB", currency_code: "GBP", suggestion_priority: 5 },
];

const sampleQuote = {
  id: "quote-1",
  source_currency: "EUR",
  target_currency: "USD",
  source_amount: 1000,
  target_amount: 1085.5,
  rate: 1.0855,
  fee_amount: 5.0,
  fee_currency: "EUR",
  expires_at: "2026-03-25T12:00:00Z",
};

describe("international MCP tools", () => {
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

  describe("intl_eligibility", () => {
    it("returns eligibility status (flat response)", async () => {
      fetchSpy.mockReturnValue(jsonResponse(sampleEligibility));

      const result = await mcpClient.callTool({
        name: "intl_eligibility",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { status: string; reason?: string };
      expect(parsed.status).toBe("STATUS_INELIGIBLE");
      expect(parsed.reason).toBe("REASON_UNKNOWN");
    });

    it("calls the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse(sampleEligibility));

      await mcpClient.callTool({
        name: "intl_eligibility",
        arguments: {},
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/international/eligibility");
    });
  });

  describe("intl_currencies", () => {
    it("returns currency list", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ currencies: sampleCurrencies }));

      const result = await mcpClient.callTool({
        name: "intl_currencies",
        arguments: { source: "EUR" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as typeof sampleCurrencies;
      expect(parsed).toHaveLength(2);
      expect((parsed[0] as (typeof sampleCurrencies)[0]).currency_code).toBe("USD");
    });

    it("calls the correct endpoint with source query param", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ currencies: sampleCurrencies }));

      await mcpClient.callTool({
        name: "intl_currencies",
        arguments: { source: "EUR" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/international/currencies");
      expect(url.searchParams.get("source")).toBe("EUR");
    });

    it("filters currencies by search term against currency_code", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ currencies: sampleCurrencies }));

      const result = await mcpClient.callTool({
        name: "intl_currencies",
        arguments: { source: "EUR", search: "gbp" },
      });

      const content = result.content as { type: string; text: string }[];
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as typeof sampleCurrencies;
      expect(parsed).toHaveLength(1);
      expect((parsed[0] as (typeof sampleCurrencies)[0]).currency_code).toBe("GBP");
    });

    it("returns empty list when search matches nothing", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ currencies: sampleCurrencies }));

      const result = await mcpClient.callTool({
        name: "intl_currencies",
        arguments: { source: "EUR", search: "XYZ999" },
      });

      const content = result.content as { type: string; text: string }[];
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as typeof sampleCurrencies;
      expect(parsed).toHaveLength(0);
    });
  });

  describe("intl_quote_create", () => {
    it("creates a quote and returns the result", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ quote: sampleQuote }));

      const result = await mcpClient.callTool({
        name: "intl_quote_create",
        arguments: {
          currency: "USD",
          amount: 1000,
          direction: "send",
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string; rate: number };
      expect(parsed.id).toBe("quote-1");
      expect(parsed.rate).toBe(1.0855);
    });

    it("sends POST to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ quote: sampleQuote }));

      await mcpClient.callTool({
        name: "intl_quote_create",
        arguments: {
          currency: "USD",
          amount: 1000,
          direction: "send",
        },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/international/quotes");
      expect(opts.method).toBe("POST");
    });

    it("uses default direction when omitted", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ quote: sampleQuote }));

      const result = await mcpClient.callTool({
        name: "intl_quote_create",
        arguments: {
          currency: "USD",
          amount: 1000,
        },
      });

      const content = result.content as { type: string; text: string }[];
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string };
      expect(parsed.id).toBe("quote-1");

      const [, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const body = JSON.parse(opts.body as string) as { quote: { direction: string } };
      expect(body.quote.direction).toBe("send");
    });
  });
});
