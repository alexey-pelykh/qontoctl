// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect } from "vitest";
import {
  CardAppearanceSchema,
  CardLevelAppearanceSchema,
  CardLevelAppearancesSchema,
  CardSchema,
  CardTypeAppearancesSchema,
  ParentCardSummarySchema,
} from "./schemas.js";

function makeAppearance() {
  return {
    assets: {
      front_large: "https://example.com/large.png",
      front_small: "https://example.com/small.png",
      front_small_wallet: "https://example.com/wallet.png",
    },
    theme: "dark" as const,
    gradient_hex_color: "#123456",
  };
}

function makeCard(overrides: Record<string, unknown> = {}) {
  return {
    id: "card-1",
    nickname: "My Card",
    embossed_name: "JOHN DOE",
    status: "live",
    pin_set: true,
    mask_pan: "XXXX-XXXX-XXXX-1234",
    exp_month: "12",
    exp_year: "2027",
    last_activity_at: "2026-01-15T10:00:00Z",
    last_digits: "1234",
    ship_to_business: false,
    atm_option: true,
    nfc_option: true,
    online_option: true,
    foreign_option: false,
    atm_monthly_limit: 1000,
    atm_monthly_spent: 200,
    atm_daily_limit: 500,
    atm_daily_spent: 100,
    atm_daily_limit_option: true,
    payment_monthly_limit: 5000,
    payment_monthly_spent: 1500,
    payment_daily_limit: 2000,
    payment_daily_spent: 300,
    payment_daily_limit_option: true,
    payment_transaction_limit: 1000,
    payment_transaction_limit_option: false,
    active_days: [1, 2, 3, 4, 5],
    holder_id: "holder-1",
    initiator_id: "initiator-1",
    bank_account_id: "ba-1",
    organization_id: "org-1",
    updated_at: "2026-01-15T10:00:00Z",
    created_at: "2025-12-01T09:00:00Z",
    shipped_at: "2025-12-05T08:00:00Z",
    card_type: "debit",
    card_level: "standard",
    payment_lifespan_limit: 50000,
    payment_lifespan_spent: 10000,
    pre_expires_at: null,
    categories: ["food", "travel"],
    renewed: false,
    renewal: false,
    parent_card_summary: null,
    had_operation: true,
    had_pin_operation: true,
    card_design: "default",
    type_of_print: "embossed",
    upsold: false,
    upsell: false,
    discard_on: null,
    reordered: false,
    appearance: makeAppearance(),
    has_only_user_liftable_locks: false,
    ...overrides,
  };
}

describe("CardAppearanceSchema", () => {
  it("accepts valid appearance", () => {
    const result = CardAppearanceSchema.parse(makeAppearance());
    expect(result.theme).toBe("dark");
  });

  it("rejects missing assets", () => {
    expect(() => CardAppearanceSchema.parse({ theme: "light", gradient_hex_color: "#000" })).toThrow();
  });
});

describe("ParentCardSummarySchema", () => {
  it("accepts valid parent card summary", () => {
    const result = ParentCardSummarySchema.parse({ id: "card-0", last_digits: "5678" });
    expect(result.id).toBe("card-0");
  });

  it("rejects missing fields", () => {
    expect(() => ParentCardSummarySchema.parse({ id: "card-0" })).toThrow();
  });
});

describe("CardSchema", () => {
  it("accepts a complete valid card", () => {
    const result = CardSchema.parse(makeCard());
    expect(result.id).toBe("card-1");
    expect(result.status).toBe("live");
    expect(result.active_days).toEqual([1, 2, 3, 4, 5]);
  });

  it("accepts nullable fields as null", () => {
    const result = CardSchema.parse(
      makeCard({
        embossed_name: null,
        mask_pan: null,
        exp_month: null,
        exp_year: null,
        last_digits: null,
        shipped_at: null,
        type_of_print: null,
        discard_on: null,
      }),
    );
    expect(result.embossed_name).toBeNull();
    expect(result.type_of_print).toBeNull();
  });

  it("accepts card with parent_card_summary", () => {
    const result = CardSchema.parse(
      makeCard({
        parent_card_summary: { id: "card-0", last_digits: "5678" },
        renewal: true,
      }),
    );
    expect(result.parent_card_summary).toEqual({ id: "card-0", last_digits: "5678" });
  });

  it("validates all card status values", () => {
    const statuses = [
      "pending",
      "live",
      "paused",
      "stolen",
      "lost",
      "pin_blocked",
      "discarded",
      "expired",
      "shipped_lost",
      "onhold",
      "order_canceled",
      "pre_expired",
      "abusive",
    ];
    for (const status of statuses) {
      const result = CardSchema.parse(makeCard({ status }));
      expect(result.status).toBe(status);
    }
  });

  it("validates card_level values", () => {
    const levels = ["standard", "plus", "metal", "virtual", "virtual_partner", "flash", "advertising"];
    for (const card_level of levels) {
      const result = CardSchema.parse(makeCard({ card_level }));
      expect(result.card_level).toBe(card_level);
    }
  });

  it("validates card_type values", () => {
    for (const card_type of ["debit", "prepaid"]) {
      const result = CardSchema.parse(makeCard({ card_type }));
      expect(result.card_type).toBe(card_type);
    }
  });

  it("rejects invalid status", () => {
    expect(() => CardSchema.parse(makeCard({ status: "invalid" }))).toThrow();
  });

  it("strips extra fields", () => {
    const result = CardSchema.parse({ ...makeCard(), extra_field: "should be stripped" });
    expect(result).not.toHaveProperty("extra_field");
  });

  it("rejects missing required field", () => {
    const { id: _, ...cardWithoutId } = makeCard();
    expect(() => CardSchema.parse(cardWithoutId)).toThrow();
  });
});

describe("CardLevelAppearanceSchema", () => {
  it("accepts valid level appearance", () => {
    const result = CardLevelAppearanceSchema.parse({
      design: "classic",
      assets: {
        front_large: "https://example.com/large.png",
        front_small: "https://example.com/small.png",
        front_small_wallet: "https://example.com/wallet.png",
      },
      theme: "light",
      gradient_hex_color: "#ffffff",
      is_active: true,
    });
    expect(result.design).toBe("classic");
    expect(result.is_active).toBe(true);
  });
});

describe("CardLevelAppearancesSchema", () => {
  it("accepts valid level appearances group", () => {
    const result = CardLevelAppearancesSchema.parse({
      card_level: "standard",
      appearances: [
        {
          design: "classic",
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
    });
    expect(result.card_level).toBe("standard");
    expect(result.appearances).toHaveLength(1);
  });
});

describe("CardTypeAppearancesSchema", () => {
  it("accepts valid type appearances group", () => {
    const result = CardTypeAppearancesSchema.parse({
      card_type: "debit",
      card_level_appearances: [
        {
          card_level: "standard",
          appearances: [
            {
              design: "classic",
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
    });
    expect(result.card_type).toBe("debit");
    expect(result.card_level_appearances).toHaveLength(1);
  });

  it("rejects missing card_level_appearances", () => {
    expect(() => CardTypeAppearancesSchema.parse({ card_type: "debit" })).toThrow();
  });
});
