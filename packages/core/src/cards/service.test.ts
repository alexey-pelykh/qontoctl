// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import {
  buildCardQueryParams,
  bulkCreateCards,
  createCard,
  discardCard,
  getCard,
  getCardIframeUrl,
  listCardAppearances,
  listCards,
  lockCard,
  reportCardLost,
  reportCardStolen,
  unlockCard,
  updateCardLimits,
  updateCardNickname,
  updateCardOptions,
  updateCardRestrictions,
} from "./service.js";

const MOCK_CARD = {
  id: "card-1",
  nickname: "My Card",
  embossed_name: null,
  status: "pending",
  pin_set: false,
  mask_pan: null,
  exp_month: null,
  exp_year: null,
  last_activity_at: "2026-01-01T00:00:00Z",
  last_digits: null,
  ship_to_business: false,
  atm_option: true,
  nfc_option: true,
  online_option: true,
  foreign_option: true,
  atm_monthly_limit: 1000,
  atm_monthly_spent: 0,
  atm_daily_limit: 500,
  atm_daily_spent: 0,
  atm_daily_limit_option: false,
  payment_monthly_limit: 5000,
  payment_monthly_spent: 0,
  payment_daily_limit: 2000,
  payment_daily_spent: 0,
  payment_daily_limit_option: false,
  payment_transaction_limit: 1000,
  payment_transaction_limit_option: false,
  active_days: [1, 2, 3, 4, 5],
  holder_id: "holder-1",
  initiator_id: "init-1",
  bank_account_id: "ba-1",
  organization_id: "org-1",
  updated_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  shipped_at: null,
  card_type: "debit",
  card_level: "standard",
  payment_lifespan_limit: 50000,
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
      front_large: "https://example.com/large.png",
      front_small: "https://example.com/small.png",
      front_small_wallet: "https://example.com/wallet.png",
    },
    theme: "light",
    gradient_hex_color: "#FFFFFF",
  },
  has_only_user_liftable_locks: false,
};

describe("createCard", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: HttpClient;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new HttpClient({
      baseUrl: "https://thirdparty.qonto.com",
      authorization: "slug:secret",
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("wraps params in { card: ... } in the request body", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ card: MOCK_CARD }));

    await createCard(client, {
      holder_id: "holder-1",
      initiator_id: "init-1",
      organization_id: "org-1",
      bank_account_id: "ba-1",
      card_level: "standard",
    });

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/cards");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      card: {
        holder_id: "holder-1",
        initiator_id: "init-1",
        organization_id: "org-1",
        bank_account_id: "ba-1",
        card_level: "standard",
      },
    });
  });
});

describe("buildCardQueryParams", () => {
  it("returns empty object for empty params", () => {
    expect(buildCardQueryParams({})).toEqual({});
  });

  it("maps scalar params", () => {
    expect(buildCardQueryParams({ query: "test", sort_by: "created_at:desc" })).toEqual({
      query: "test",
      sort_by: "created_at:desc",
    });
  });

  it("maps array params with [] suffix", () => {
    expect(
      buildCardQueryParams({
        holder_ids: ["h1"],
        statuses: ["active"],
        bank_account_ids: ["ba1"],
        card_levels: ["standard"],
        ids: ["id1"],
      }),
    ).toEqual({
      "holder_ids[]": ["h1"],
      "statuses[]": ["active"],
      "bank_account_ids[]": ["ba1"],
      "card_levels[]": ["standard"],
      "ids[]": ["id1"],
    });
  });

  it("omits empty arrays", () => {
    expect(
      buildCardQueryParams({
        holder_ids: [],
        statuses: [],
        bank_account_ids: [],
        card_levels: [],
        ids: [],
      }),
    ).toEqual({});
  });
});

describe("getCard", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: HttpClient;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new HttpClient({ baseUrl: "https://thirdparty.qonto.com", authorization: "slug:secret" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches a card by ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ card: MOCK_CARD }));

    const result = await getCard(client, "card-1");
    expect(result.id).toBe("card-1");

    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/cards/card-1");
  });

  it("encodes special characters in ID", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ card: MOCK_CARD }));
    await getCard(client, "a/b");
    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/cards/a%2Fb");
  });
});

describe("listCards", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: HttpClient;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new HttpClient({ baseUrl: "https://thirdparty.qonto.com", authorization: "slug:secret" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lists cards without params", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        cards: [MOCK_CARD],
        meta: { current_page: 1, next_page: null, prev_page: null, total_pages: 1, total_count: 1, per_page: 25 },
      }),
    );
    const result = await listCards(client);
    expect(result.cards).toHaveLength(1);
    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.pathname).toBe("/v2/cards");
  });

  it("passes filter and pagination params", async () => {
    fetchSpy.mockReturnValue(
      jsonResponse({
        cards: [],
        meta: { current_page: 2, next_page: 3, prev_page: 1, total_pages: 3, total_count: 50, per_page: 10 },
      }),
    );
    await listCards(client, { page: 2, per_page: 10, statuses: ["active"] });
    const [url] = fetchSpy.mock.calls[0] as [URL];
    expect(url.searchParams.get("page")).toBe("2");
    expect(url.searchParams.get("per_page")).toBe("10");
    expect(url.searchParams.getAll("statuses[]")).toEqual(["active"]);
  });
});

describe("bulkCreateCards", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: HttpClient;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new HttpClient({ baseUrl: "https://thirdparty.qonto.com", authorization: "slug:secret" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends cards array in request body", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ cards: [MOCK_CARD] }));

    const params = {
      holder_id: "holder-1",
      initiator_id: "init-1",
      organization_id: "org-1",
      bank_account_id: "ba-1",
      card_level: "standard" as const,
    };
    const result = await bulkCreateCards(client, [params]);
    expect(result).toHaveLength(1);

    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/cards/bulk");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body).toHaveProperty("cards");
  });
});

describe("card state actions", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: HttpClient;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new HttpClient({ baseUrl: "https://thirdparty.qonto.com", authorization: "slug:secret" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("lockCard sends PUT to /lock", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ card: MOCK_CARD }));
    await lockCard(client, "card-1");
    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/cards/card-1/lock");
    expect(opts.method).toBe("PUT");
  });

  it("unlockCard sends PUT to /unlock", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ card: MOCK_CARD }));
    await unlockCard(client, "card-1");
    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/cards/card-1/unlock");
    expect(opts.method).toBe("PUT");
  });

  it("reportCardLost sends PUT to /lost", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ card: MOCK_CARD }));
    await reportCardLost(client, "card-1");
    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/cards/card-1/lost");
    expect(opts.method).toBe("PUT");
  });

  it("reportCardStolen sends PUT to /stolen", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ card: MOCK_CARD }));
    await reportCardStolen(client, "card-1");
    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/cards/card-1/stolen");
    expect(opts.method).toBe("PUT");
  });

  it("discardCard sends PUT to /discard", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ card: MOCK_CARD }));
    await discardCard(client, "card-1");
    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/cards/card-1/discard");
    expect(opts.method).toBe("PUT");
  });
});

describe("card update actions", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: HttpClient;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new HttpClient({ baseUrl: "https://thirdparty.qonto.com", authorization: "slug:secret" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("updateCardLimits sends PATCH to /limits", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ card: MOCK_CARD }));
    await updateCardLimits(client, "card-1", { payment_monthly_limit: 10000 });
    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/cards/card-1/limits");
    expect(opts.method).toBe("PATCH");
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body).toEqual({ card: { payment_monthly_limit: 10000 } });
  });

  it("updateCardNickname sends PATCH to /nickname", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ card: MOCK_CARD }));
    await updateCardNickname(client, "card-1", "New Name");
    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/cards/card-1/nickname");
    expect(opts.method).toBe("PATCH");
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body).toEqual({ card: { nickname: "New Name" } });
  });

  it("updateCardOptions sends PATCH to /options", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ card: MOCK_CARD }));
    await updateCardOptions(client, "card-1", { atm_option: false });
    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/cards/card-1/options");
    expect(opts.method).toBe("PATCH");
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body).toEqual({ card: { atm_option: false } });
  });

  it("updateCardRestrictions sends PATCH to /restrictions", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ card: MOCK_CARD }));
    await updateCardRestrictions(client, "card-1", { active_days: [1, 2, 3] });
    const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
    expect(url.pathname).toBe("/v2/cards/card-1/restrictions");
    expect(opts.method).toBe("PATCH");
    const body = JSON.parse(opts.body as string) as Record<string, unknown>;
    expect(body).toEqual({ card: { active_days: [1, 2, 3] } });
  });
});

describe("getCardIframeUrl", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: HttpClient;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new HttpClient({ baseUrl: "https://thirdparty.qonto.com", authorization: "slug:secret" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns the iframe URL", async () => {
    fetchSpy.mockReturnValue(jsonResponse({ iframe_url: "https://example.com/iframe" }));
    const url = await getCardIframeUrl(client, "card-1");
    expect(url).toBe("https://example.com/iframe");
    const [reqUrl] = fetchSpy.mock.calls[0] as [URL];
    expect(reqUrl.pathname).toBe("/v2/cards/card-1/data_view");
  });
});

describe("listCardAppearances", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: HttpClient;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new HttpClient({ baseUrl: "https://thirdparty.qonto.com", authorization: "slug:secret" });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns card type appearances", async () => {
    const appearances = [
      {
        card_type: "debit",
        card_level_appearances: [
          {
            card_level: "standard",
            appearances: [
              {
                design: "default",
                assets: {
                  front_large: "https://example.com/large.png",
                  front_small: "https://example.com/small.png",
                  front_small_wallet: "https://example.com/wallet.png",
                },
                theme: "light",
                gradient_hex_color: "#FFFFFF",
                is_active: true,
              },
            ],
          },
        ],
      },
    ];
    fetchSpy.mockReturnValue(jsonResponse({ card_type_appearances: appearances }));
    const result = await listCardAppearances(client);
    expect(result).toHaveLength(1);
    expect(result[0]).toBeDefined();
    expect(result[0]?.card_type).toBe("debit");
    const [reqUrl] = fetchSpy.mock.calls[0] as [URL];
    expect(reqUrl.pathname).toBe("/v2/cards/appearances");
  });
});
