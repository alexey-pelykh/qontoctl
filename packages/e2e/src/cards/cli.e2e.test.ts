// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { CardSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cli, cliJson } from "../helpers.js";
import { hasOAuthCredentials, pinAuthPreference } from "../sandbox.js";

interface CardItem {
  readonly id: string;
  readonly nickname: string | null;
  readonly last_digits: string | null;
  readonly status: string;
  readonly card_level: string;
  readonly holder_id: string;
}

describe.skipIf(!hasOAuthCredentials())("card CLI commands (e2e)", () => {
  pinAuthPreference("oauth-first");

  describe("card list", () => {
    it("lists cards with default output", () => {
      const output = cli("card", "list");
      expect(output).toBeDefined();
    });

    it("lists cards as JSON", () => {
      const cards = cliJson<CardItem[]>("card", "list");
      expect(Array.isArray(cards)).toBe(true);
      const first = cards[0];
      if (first !== undefined) {
        CardSchema.parse(first);
        expect(first).toHaveProperty("id");
        expect(first).toHaveProperty("status");
        expect(first).toHaveProperty("card_level");
      }
    });

    it("supports pagination", () => {
      const cards = cliJson<CardItem[]>("card", "list", "--per-page", "2", "--page", "1");
      expect(Array.isArray(cards)).toBe(true);
      expect(cards.length).toBeLessThanOrEqual(2);
    });

    it("filters by status", () => {
      const cards = cliJson<CardItem[]>("card", "list", "--status", "live");
      expect(Array.isArray(cards)).toBe(true);
      for (const c of cards) {
        expect(c.status).toBe("live");
      }
    });

    it("filters by card level", () => {
      const cards = cliJson<CardItem[]>("card", "list", "--card-level", "virtual");
      expect(Array.isArray(cards)).toBe(true);
      for (const c of cards) {
        expect(c.card_level).toBe("virtual");
      }
    });

    it("outputs CSV format", () => {
      // CSV formatter emits no output for an empty list, so there is no header
      // row to assert against — skip when the sandbox has zero cards.
      const cards = cliJson<CardItem[]>("card", "list", "--per-page", "5");
      if (cards[0] === undefined) return;

      const output = cli("card", "list", "--output", "csv", "--per-page", "5");
      const lines = output.trim().split("\n");
      expect(lines.length).toBeGreaterThanOrEqual(1);
      const header = lines[0] ?? "";
      expect(header).toContain("id");
      expect(header).toContain("status");
    });

    it("outputs YAML format", () => {
      // YAML formatter emits `[]` for an empty list, so there is no `id:`
      // field to assert against — skip when the sandbox has zero cards.
      const cards = cliJson<CardItem[]>("card", "list", "--per-page", "2");
      if (cards[0] === undefined) return;

      const output = cli("card", "list", "--output", "yaml", "--per-page", "2");
      expect(output).toContain("id:");
    });
  });

  describe("card show", () => {
    it("shows a card by ID", () => {
      // Pick the first card from the list as a known-good ID. If the org has
      // no cards in the sandbox, skip — we cannot exercise show without one.
      const cards = cliJson<CardItem[]>("card", "list", "--per-page", "1");
      const first = cards[0];
      if (first === undefined) return;

      const card = cliJson<CardItem>("card", "show", first.id);
      CardSchema.parse(card);
      expect(card.id).toBe(first.id);
      expect(card).toHaveProperty("status");
      expect(card).toHaveProperty("card_level");
    });

    it("supports table output", () => {
      const cards = cliJson<CardItem[]>("card", "list", "--per-page", "1");
      const first = cards[0];
      if (first === undefined) return;

      const output = cli("card", "show", first.id);
      expect(output).toContain(first.id);
    });
  });

  describe("card iframe-url", () => {
    it("returns a secure iframe URL for an existing card", () => {
      // Pick the first card from the list. The data_view endpoint requires
      // a real card ID; skip if the sandbox has no cards.
      const cards = cliJson<CardItem[]>("card", "list", "--per-page", "1");
      const first = cards[0];
      if (first === undefined) return;

      const result = cliJson<{ iframe_url: string }>("card", "iframe-url", first.id);
      expect(result).toHaveProperty("iframe_url");
      expect(typeof result.iframe_url).toBe("string");
      // The URL must be HTTPS — the iframe carries sensitive PAN/CVV data.
      expect(result.iframe_url).toMatch(/^https:\/\//);
    });
  });
});
