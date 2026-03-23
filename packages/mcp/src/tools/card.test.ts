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
    total_count: 0,
    per_page: 100,
    ...overrides,
  };
}

function makeCard(overrides: Record<string, unknown> = {}) {
  return {
    id: "card-1",
    nickname: "My Card",
    embossed_name: null,
    status: "live",
    pin_set: false,
    mask_pan: null,
    exp_month: null,
    exp_year: null,
    last_activity_at: "2026-01-01T00:00:00.000Z",
    last_digits: "1234",
    ship_to_business: false,
    atm_option: true,
    nfc_option: true,
    online_option: true,
    foreign_option: true,
    atm_monthly_limit: 1000,
    atm_monthly_spent: 0,
    atm_daily_limit: 500,
    atm_daily_spent: 0,
    atm_daily_limit_option: true,
    payment_monthly_limit: 5000,
    payment_monthly_spent: 0,
    payment_daily_limit: 2000,
    payment_daily_spent: 0,
    payment_daily_limit_option: true,
    payment_transaction_limit: 1000,
    payment_transaction_limit_option: false,
    active_days: [1, 2, 3, 4, 5],
    holder_id: "member-1",
    initiator_id: "member-1",
    bank_account_id: "acct-1",
    organization_id: "org-1",
    updated_at: "2026-01-01T00:00:00.000Z",
    created_at: "2026-01-01T00:00:00.000Z",
    shipped_at: null,
    card_type: "debit",
    card_level: "virtual",
    payment_lifespan_limit: 0,
    payment_lifespan_spent: 0,
    pre_expires_at: null,
    categories: [],
    renewed: false,
    renewal: false,
    parent_card_summary: null,
    had_operation: false,
    had_pin_operation: false,
    card_design: "default",
    type_of_print: null,
    upsold: false,
    upsell: false,
    discard_on: null,
    reordered: false,
    appearance: {
      assets: {
        front_large: "https://example.com/front-large.png",
        front_small: "https://example.com/front-small.png",
        front_small_wallet: "https://example.com/front-small-wallet.png",
      },
      theme: "dark",
      gradient_hex_color: "#000000",
    },
    has_only_user_liftable_locks: false,
    ...overrides,
  };
}

describe("card MCP tools", () => {
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

  describe("card_list", () => {
    it("returns cards from API", async () => {
      const cards = [makeCard({ id: "card-1" }), makeCard({ id: "card-2" })];
      fetchSpy.mockReturnValue(
        jsonResponse({
          cards,
          meta: makeMeta({ total_count: 2 }),
        }),
      );

      const result = await mcpClient.callTool({
        name: "card_list",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { cards: unknown[] };
      expect(parsed.cards).toHaveLength(2);
    });

    it("passes pagination params to API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          cards: [],
          meta: makeMeta({ current_page: 2 }),
        }),
      );

      await mcpClient.callTool({
        name: "card_list",
        arguments: { page: 2, per_page: 10 },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("page")).toBe("2");
      expect(url.searchParams.get("per_page")).toBe("10");
    });

    it("passes filter params to API", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ cards: [], meta: makeMeta() }));

      await mcpClient.callTool({
        name: "card_list",
        arguments: {
          query: "test",
          holder_ids: ["member-1"],
          statuses: ["live", "paused"],
          bank_account_ids: ["acct-1"],
          card_levels: ["virtual"],
          sort_by: "status:asc",
        },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("query")).toBe("test");
      expect(url.searchParams.getAll("holder_ids[]")).toEqual(["member-1"]);
      expect(url.searchParams.getAll("statuses[]")).toEqual(["live", "paused"]);
      expect(url.searchParams.getAll("bank_account_ids[]")).toEqual(["acct-1"]);
      expect(url.searchParams.getAll("card_levels[]")).toEqual(["virtual"]);
      expect(url.searchParams.get("sort_by")).toBe("status:asc");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ cards: [], meta: makeMeta() }));

      await mcpClient.callTool({
        name: "card_list",
        arguments: {},
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/cards");
    });
  });

  describe("card_show", () => {
    it("returns a single card", async () => {
      const card = makeCard({ id: "card-123" });
      fetchSpy.mockReturnValue(jsonResponse({ card }));

      const result = await mcpClient.callTool({
        name: "card_show",
        arguments: { id: "card-123" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string };
      expect(parsed.id).toBe("card-123");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ card: makeCard({ id: "card-123" }) }));

      await mcpClient.callTool({
        name: "card_show",
        arguments: { id: "card-123" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/cards/card-123");
    });
  });

  describe("card_create", () => {
    const createdCard = makeCard({ id: "card-new", status: "pending" });

    it("creates a card and returns the result", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ card: createdCard }));

      const result = await mcpClient.callTool({
        name: "card_create",
        arguments: {
          holder_id: "member-1",
          initiator_id: "member-1",
          organization_id: "org-1",
          bank_account_id: "acct-1",
          card_level: "virtual",
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string; status: string };
      expect(parsed.id).toBe("card-new");
    });

    it("sends POST with body to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ card: createdCard }));

      await mcpClient.callTool({
        name: "card_create",
        arguments: {
          holder_id: "member-1",
          initiator_id: "member-1",
          organization_id: "org-1",
          bank_account_id: "acct-1",
          card_level: "virtual",
          atm_option: true,
          payment_monthly_limit: 5000,
        },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/cards");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body as string) as { card: Record<string, unknown> };
      expect(body.card).toHaveProperty("holder_id", "member-1");
      expect(body.card).toHaveProperty("initiator_id", "member-1");
      expect(body.card).toHaveProperty("organization_id", "org-1");
      expect(body.card).toHaveProperty("bank_account_id", "acct-1");
      expect(body.card).toHaveProperty("card_level", "virtual");
      expect(body.card).toHaveProperty("atm_option", true);
      expect(body.card).toHaveProperty("payment_monthly_limit", 5000);
    });
  });

  describe("card_bulk_create", () => {
    const createdCards = [makeCard({ id: "card-b1" }), makeCard({ id: "card-b2" })];

    it("bulk creates cards and returns the result", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ cards: createdCards }));

      const result = await mcpClient.callTool({
        name: "card_bulk_create",
        arguments: {
          cards: [
            {
              holder_id: "member-1",
              initiator_id: "member-1",
              organization_id: "org-1",
              bank_account_id: "acct-1",
              card_level: "virtual",
            },
            {
              holder_id: "member-2",
              initiator_id: "member-1",
              organization_id: "org-1",
              bank_account_id: "acct-1",
              card_level: "standard",
            },
          ],
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as unknown[];
      expect(parsed).toHaveLength(2);
    });

    it("sends POST with body to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ cards: createdCards }));

      await mcpClient.callTool({
        name: "card_bulk_create",
        arguments: {
          cards: [
            {
              holder_id: "member-1",
              initiator_id: "member-1",
              organization_id: "org-1",
              bank_account_id: "acct-1",
              card_level: "virtual",
            },
          ],
        },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/cards/bulk");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body as string) as { cards: unknown[] };
      expect(body.cards).toHaveLength(1);
      expect(body.cards[0]).toHaveProperty("holder_id", "member-1");
    });
  });

  describe("card_lock", () => {
    it("locks a card and returns the result", async () => {
      const lockedCard = makeCard({ id: "card-1", status: "paused" });
      fetchSpy.mockReturnValue(jsonResponse({ card: lockedCard }));

      const result = await mcpClient.callTool({
        name: "card_lock",
        arguments: { id: "card-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string; status: string };
      expect(parsed.id).toBe("card-1");
      expect(parsed.status).toBe("paused");
    });

    it("calls the correct API endpoint with PUT", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ card: makeCard() }));

      await mcpClient.callTool({
        name: "card_lock",
        arguments: { id: "card-1" },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/cards/card-1/lock");
      expect(opts.method).toBe("PUT");
    });
  });

  describe("card_unlock", () => {
    it("unlocks a card and returns the result", async () => {
      const unlockedCard = makeCard({ id: "card-1", status: "live" });
      fetchSpy.mockReturnValue(jsonResponse({ card: unlockedCard }));

      const result = await mcpClient.callTool({
        name: "card_unlock",
        arguments: { id: "card-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string; status: string };
      expect(parsed.id).toBe("card-1");
      expect(parsed.status).toBe("live");
    });

    it("calls the correct API endpoint with PUT", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ card: makeCard() }));

      await mcpClient.callTool({
        name: "card_unlock",
        arguments: { id: "card-1" },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/cards/card-1/unlock");
      expect(opts.method).toBe("PUT");
    });
  });

  describe("card_report_lost", () => {
    it("reports a card as lost and returns the result", async () => {
      const lostCard = makeCard({ id: "card-1", status: "lost" });
      fetchSpy.mockReturnValue(jsonResponse({ card: lostCard }));

      const result = await mcpClient.callTool({
        name: "card_report_lost",
        arguments: { id: "card-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string; status: string };
      expect(parsed.id).toBe("card-1");
      expect(parsed.status).toBe("lost");
    });

    it("calls the correct API endpoint with PUT", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ card: makeCard() }));

      await mcpClient.callTool({
        name: "card_report_lost",
        arguments: { id: "card-1" },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/cards/card-1/lost");
      expect(opts.method).toBe("PUT");
    });
  });

  describe("card_report_stolen", () => {
    it("reports a card as stolen and returns the result", async () => {
      const stolenCard = makeCard({ id: "card-1", status: "stolen" });
      fetchSpy.mockReturnValue(jsonResponse({ card: stolenCard }));

      const result = await mcpClient.callTool({
        name: "card_report_stolen",
        arguments: { id: "card-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string; status: string };
      expect(parsed.id).toBe("card-1");
      expect(parsed.status).toBe("stolen");
    });

    it("calls the correct API endpoint with PUT", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ card: makeCard() }));

      await mcpClient.callTool({
        name: "card_report_stolen",
        arguments: { id: "card-1" },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/cards/card-1/stolen");
      expect(opts.method).toBe("PUT");
    });
  });

  describe("card_discard", () => {
    it("discards a card and returns the result", async () => {
      const discardedCard = makeCard({ id: "card-1", status: "discarded" });
      fetchSpy.mockReturnValue(jsonResponse({ card: discardedCard }));

      const result = await mcpClient.callTool({
        name: "card_discard",
        arguments: { id: "card-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string; status: string };
      expect(parsed.id).toBe("card-1");
      expect(parsed.status).toBe("discarded");
    });

    it("calls the correct API endpoint with PUT", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ card: makeCard() }));

      await mcpClient.callTool({
        name: "card_discard",
        arguments: { id: "card-1" },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/cards/card-1/discard");
      expect(opts.method).toBe("PUT");
    });
  });

  describe("card_update_limits", () => {
    const updatedCard = makeCard({ id: "card-1", payment_monthly_limit: 3000 });

    it("updates card limits and returns the result", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ card: updatedCard }));

      const result = await mcpClient.callTool({
        name: "card_update_limits",
        arguments: {
          id: "card-1",
          payment_monthly_limit: 3000,
          atm_monthly_limit: 500,
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string };
      expect(parsed.id).toBe("card-1");
    });

    it("sends PATCH with body to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ card: updatedCard }));

      await mcpClient.callTool({
        name: "card_update_limits",
        arguments: {
          id: "card-1",
          payment_monthly_limit: 3000,
          atm_monthly_limit: 500,
        },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/cards/card-1/limits");
      expect(opts.method).toBe("PATCH");
      const body = JSON.parse(opts.body as string) as { card: Record<string, unknown> };
      expect(body.card).toHaveProperty("payment_monthly_limit", 3000);
      expect(body.card).toHaveProperty("atm_monthly_limit", 500);
    });
  });

  describe("card_update_nickname", () => {
    const updatedCard = makeCard({ id: "card-1", nickname: "Work Card" });

    it("updates card nickname and returns the result", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ card: updatedCard }));

      const result = await mcpClient.callTool({
        name: "card_update_nickname",
        arguments: { id: "card-1", nickname: "Work Card" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string; nickname: string };
      expect(parsed.id).toBe("card-1");
      expect(parsed.nickname).toBe("Work Card");
    });

    it("sends PATCH with body to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ card: updatedCard }));

      await mcpClient.callTool({
        name: "card_update_nickname",
        arguments: { id: "card-1", nickname: "Work Card" },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/cards/card-1/nickname");
      expect(opts.method).toBe("PATCH");
      const body = JSON.parse(opts.body as string) as { card: { nickname: string } };
      expect(body.card.nickname).toBe("Work Card");
    });
  });

  describe("card_update_options", () => {
    const updatedCard = makeCard({ id: "card-1" });

    it("updates card options and returns the result", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ card: updatedCard }));

      const result = await mcpClient.callTool({
        name: "card_update_options",
        arguments: {
          id: "card-1",
          atm_option: true,
          nfc_option: true,
          online_option: false,
          foreign_option: true,
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string };
      expect(parsed.id).toBe("card-1");
    });

    it("sends PATCH with body to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ card: updatedCard }));

      await mcpClient.callTool({
        name: "card_update_options",
        arguments: {
          id: "card-1",
          atm_option: true,
          nfc_option: false,
          online_option: true,
          foreign_option: false,
        },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/cards/card-1/options");
      expect(opts.method).toBe("PATCH");
      const body = JSON.parse(opts.body as string) as { card: Record<string, boolean> };
      expect(body.card).toHaveProperty("atm_option", true);
      expect(body.card).toHaveProperty("nfc_option", false);
      expect(body.card).toHaveProperty("online_option", true);
      expect(body.card).toHaveProperty("foreign_option", false);
    });
  });

  describe("card_update_restrictions", () => {
    const updatedCard = makeCard({ id: "card-1" });

    it("updates card restrictions and returns the result", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ card: updatedCard }));

      const result = await mcpClient.callTool({
        name: "card_update_restrictions",
        arguments: {
          id: "card-1",
          active_days: [1, 2, 3, 4, 5],
          categories: ["transport", "restaurant_and_bar"],
        },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { id: string };
      expect(parsed.id).toBe("card-1");
    });

    it("sends PATCH with body to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ card: updatedCard }));

      await mcpClient.callTool({
        name: "card_update_restrictions",
        arguments: {
          id: "card-1",
          active_days: [1, 2, 3, 4, 5],
          categories: ["transport"],
        },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/cards/card-1/restrictions");
      expect(opts.method).toBe("PATCH");
      const body = JSON.parse(opts.body as string) as { card: Record<string, unknown> };
      expect(body.card).toHaveProperty("active_days", [1, 2, 3, 4, 5]);
      expect(body.card).toHaveProperty("categories", ["transport"]);
    });
  });

  describe("card_iframe_url", () => {
    it("returns the iframe URL", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ iframe_url: "https://secure.qonto.com/cards/card-1/iframe" }));

      const result = await mcpClient.callTool({
        name: "card_iframe_url",
        arguments: { id: "card-1" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { iframe_url: string };
      expect(parsed.iframe_url).toBe("https://secure.qonto.com/cards/card-1/iframe");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ iframe_url: "https://secure.qonto.com/cards/card-1/iframe" }));

      await mcpClient.callTool({
        name: "card_iframe_url",
        arguments: { id: "card-1" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/cards/card-1/data_view");
    });
  });

  describe("card_appearances", () => {
    it("returns card appearances", async () => {
      const appearances = [
        {
          card_type: "virtual",
          card_level_appearances: [
            {
              card_level: "virtual",
              appearances: [
                {
                  design: "default",
                  assets: {
                    front_large: "https://example.com/large.png",
                    front_small: "https://example.com/small.png",
                    front_small_wallet: "https://example.com/wallet.png",
                  },
                  theme: "dark",
                  gradient_hex_color: "#000000",
                  is_active: true,
                },
              ],
            },
          ],
        },
        {
          card_type: "standard",
          card_level_appearances: [
            {
              card_level: "standard",
              appearances: [
                {
                  design: "classic",
                  assets: {
                    front_large: "https://example.com/large2.png",
                    front_small: "https://example.com/small2.png",
                    front_small_wallet: "https://example.com/wallet2.png",
                  },
                  theme: "light",
                  gradient_hex_color: "#ffffff",
                  is_active: true,
                },
              ],
            },
          ],
        },
      ];
      fetchSpy.mockReturnValue(jsonResponse({ card_type_appearances: appearances }));

      const result = await mcpClient.callTool({
        name: "card_appearances",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as unknown[];
      expect(parsed).toHaveLength(2);
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ card_type_appearances: [] }));

      await mcpClient.callTool({
        name: "card_appearances",
        arguments: {},
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/cards/appearances");
    });
  });
});
