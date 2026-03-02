// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

describe("request MCP tools", () => {
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

  describe("request_list", () => {
    it("returns requests from API", async () => {
      const requests = [
        {
          id: "req-1",
          request_type: "transfer",
          status: "pending",
          initiator_id: "user-1",
          approver_id: null,
          note: "Office supplies",
          declined_note: null,
          processed_at: null,
          created_at: "2026-01-15T10:00:00.000Z",
          creditor_name: "ACME Corp",
          amount: "150.00",
          currency: "EUR",
          scheduled_date: "2026-01-20",
          recurrence: "once",
          last_recurrence_date: null,
          attachment_ids: [],
        },
      ];
      fetchSpy.mockReturnValue(
        jsonResponse({
          requests,
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
        name: "request_list",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { requests: unknown[] };
      expect(parsed.requests).toHaveLength(1);
    });

    it("passes pagination params to API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          requests: [],
          meta: {
            current_page: 3,
            next_page: null,
            prev_page: 2,
            total_pages: 3,
            total_count: 0,
            per_page: 25,
          },
        }),
      );

      await mcpClient.callTool({
        name: "request_list",
        arguments: { current_page: 3, per_page: 25 },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("current_page")).toBe("3");
      expect(url.searchParams.get("per_page")).toBe("25");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          requests: [],
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
        name: "request_list",
        arguments: {},
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/requests");
    });
  });

  describe("request_approve", () => {
    it("posts to the correct approve endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({}));

      const result = await mcpClient.callTool({
        name: "request_approve",
        arguments: { request_type: "transfer", id: "req-1" },
      });

      const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/requests/transfers/req-1/approve");
      expect(init.method).toBe("POST");

      const content = result.content as { type: string; text: string }[];
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as { approved: boolean; id: string };
      expect(parsed.approved).toBe(true);
      expect(parsed.id).toBe("req-1");
    });

    it("sends debit_iban when provided", async () => {
      fetchSpy.mockReturnValue(jsonResponse({}));

      await mcpClient.callTool({
        name: "request_approve",
        arguments: { request_type: "multi_transfer", id: "req-2", debit_iban: "FR7612345000010009876543210" },
      });

      const [, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body).toEqual({ debit_iban: "FR7612345000010009876543210" });
    });
  });

  describe("request_decline", () => {
    it("posts to the correct decline endpoint with declined_note", async () => {
      fetchSpy.mockReturnValue(jsonResponse({}));

      const result = await mcpClient.callTool({
        name: "request_decline",
        arguments: { request_type: "flash_card", id: "req-1", declined_note: "Not approved" },
      });

      const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/requests/flash_cards/req-1/decline");
      expect(init.method).toBe("POST");

      const body = JSON.parse(init.body as string) as Record<string, unknown>;
      expect(body).toEqual({ declined_note: "Not approved" });

      const content = result.content as { type: string; text: string }[];
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as { declined: boolean; id: string };
      expect(parsed.declined).toBe(true);
    });
  });

  describe("request_create_flash_card", () => {
    it("creates a flash card request", async () => {
      const request = {
        id: "req-1",
        request_type: "flash_card",
        status: "pending",
        initiator_id: "user-1",
        approver_id: null,
        note: "Travel",
        declined_note: null,
        payment_lifespan_limit: "500.00",
        pre_expires_at: "2026-06-01T00:00:00.000Z",
        currency: "EUR",
        processed_at: null,
        created_at: "2026-03-01T10:00:00.000Z",
      };
      fetchSpy.mockReturnValue(jsonResponse({ request_flash_card: request }));

      const result = await mcpClient.callTool({
        name: "request_create_flash_card",
        arguments: { note: "Travel", payment_lifespan_limit: "500.00" },
      });

      const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/requests/flash_cards");
      expect(init.method).toBe("POST");

      const content = result.content as { type: string; text: string }[];
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as { id: string; request_type: string };
      expect(parsed.id).toBe("req-1");
      expect(parsed.request_type).toBe("flash_card");
    });
  });

  describe("request_create_virtual_card", () => {
    it("creates a virtual card request", async () => {
      const request = {
        id: "req-1",
        request_type: "virtual_card",
        status: "pending",
        initiator_id: "user-1",
        approver_id: null,
        note: "Subscription",
        declined_note: null,
        payment_monthly_limit: "200.00",
        currency: "EUR",
        processed_at: null,
        created_at: "2026-03-01T10:00:00.000Z",
        card_level: "virtual",
        card_design: "virtual.default.2017",
      };
      fetchSpy.mockReturnValue(jsonResponse({ request_virtual_card: request }));

      const result = await mcpClient.callTool({
        name: "request_create_virtual_card",
        arguments: { note: "Subscription", payment_monthly_limit: "200.00" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/requests/virtual_cards");

      const content = result.content as { type: string; text: string }[];
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as { id: string; request_type: string };
      expect(parsed.id).toBe("req-1");
      expect(parsed.request_type).toBe("virtual_card");
    });
  });

  describe("request_create_multi_transfer", () => {
    it("creates a multi-transfer request", async () => {
      const request = {
        id: "req-1",
        request_type: "multi_transfer",
        status: "pending",
        initiator_id: "user-1",
        approver_id: null,
        note: "Payments",
        declined_note: null,
        total_transfers_amount: "300.00",
        total_transfers_amount_currency: "EUR",
        total_transfers_count: 2,
        scheduled_date: "2026-04-01",
        processed_at: null,
        created_at: "2026-03-01T10:00:00.000Z",
      };
      fetchSpy.mockReturnValue(jsonResponse({ request_multi_transfer: request }));

      const result = await mcpClient.callTool({
        name: "request_create_multi_transfer",
        arguments: {
          note: "Payments",
          transfers: [
            {
              amount: "150.00",
              currency: "EUR",
              credit_iban: "FR7612345000010009876543210",
              credit_account_name: "Vendor A",
              credit_account_currency: "EUR",
              reference: "Invoice 001",
            },
            {
              amount: "150.00",
              currency: "EUR",
              credit_iban: "DE89370400440532013000",
              credit_account_name: "Vendor B",
              credit_account_currency: "EUR",
              reference: "Invoice 002",
            },
          ],
        },
      });

      const [url, init] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/requests/multi_transfers");
      expect(init.method).toBe("POST");

      const content = result.content as { type: string; text: string }[];
      const parsed = JSON.parse((content[0] as { type: string; text: string }).text) as { id: string; total_transfers_count: number };
      expect(parsed.id).toBe("req-1");
      expect(parsed.total_transfers_count).toBe(2);
    });
  });
});
