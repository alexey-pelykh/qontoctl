// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { HttpClient } from "../http-client.js";
import { jsonResponse } from "../testing/json-response.js";
import { createCard } from "./service.js";

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
