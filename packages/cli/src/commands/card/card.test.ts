// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "@qontoctl/core/testing";
import type { PaginationMeta } from "../../pagination.js";
import type { Card, CardTypeAppearances } from "@qontoctl/core";

vi.mock("../../client.js", () => ({
  createClient: vi.fn(),
}));

vi.mock("../../sca.js", () => ({
  executeWithCliSca: vi.fn((_client: unknown, operation: (scaSessionToken?: string) => Promise<unknown>) =>
    operation(undefined),
  ),
}));

vi.mock("node:fs/promises", () => ({
  readFile: vi.fn(),
}));

import { createClient } from "../../client.js";
import { HttpClient } from "@qontoctl/core";

function makeMeta(overrides: Partial<PaginationMeta> = {}): PaginationMeta {
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

function makeCard(overrides: Partial<Card> = {}): Card {
  return {
    id: "card-1",
    nickname: "My Card",
    embossed_name: "ALICE SMITH",
    status: "live",
    pin_set: true,
    mask_pan: "XXXX XXXX XXXX 1234",
    exp_month: "12",
    exp_year: "2027",
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
    payment_transaction_limit_option: true,
    active_days: [1, 2, 3, 4, 5],
    holder_id: "mem-1",
    initiator_id: "mem-2",
    bank_account_id: "acc-1",
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
  } as Card;
}

describe("card commands", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: HttpClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stderrSpy: any;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new HttpClient({
      baseUrl: "https://thirdparty.qonto.com",
      authorization: "slug:secret",
    });
    vi.mocked(createClient).mockResolvedValue(client);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation((() => true) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("card list", () => {
    it("lists cards in table format", async () => {
      const cards = [makeCard(), makeCard({ id: "card-2", nickname: "Second Card", status: "paused" })];
      fetchSpy.mockImplementation(() =>
        jsonResponse({
          cards,
          meta: makeMeta({ total_count: 2 }),
        }),
      );

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["card", "list"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("card-1");
      expect(output).toContain("My Card");
      expect(output).toContain("card-2");
      expect(output).toContain("Second Card");
    });

    it("lists cards in json format", async () => {
      const cards = [makeCard()];
      fetchSpy.mockImplementation(() =>
        jsonResponse({
          cards,
          meta: makeMeta({ total_count: 1 }),
        }),
      );

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["--output", "json", "card", "list"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as unknown[];
      expect(parsed).toHaveLength(1);
    });

    it("passes filter options as query params", async () => {
      fetchSpy.mockImplementation(() =>
        jsonResponse({
          cards: [],
          meta: makeMeta(),
        }),
      );

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(
        [
          "card",
          "list",
          "--query",
          "test",
          "--holder-id",
          "h1",
          "h2",
          "--status",
          "live",
          "--bank-account-id",
          "ba1",
          "--card-level",
          "virtual",
          "--sort-by",
          "status:asc",
        ],
        { from: "user" },
      );

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("query")).toBe("test");
      expect(url.searchParams.getAll("holder_ids[]")).toEqual(["h1", "h2"]);
      expect(url.searchParams.getAll("statuses[]")).toEqual(["live"]);
      expect(url.searchParams.getAll("bank_account_ids[]")).toEqual(["ba1"]);
      expect(url.searchParams.getAll("card_levels[]")).toEqual(["virtual"]);
      expect(url.searchParams.get("sort_by")).toBe("status:asc");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockImplementation(() =>
        jsonResponse({
          cards: [],
          meta: makeMeta(),
        }),
      );

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["card", "list"], { from: "user" });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/cards");
    });
  });

  describe("card create", () => {
    it("creates a card and outputs in table format", async () => {
      const card = makeCard({ status: "pending" });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(
        [
          "card",
          "create",
          "--holder-id",
          "mem-1",
          "--initiator-id",
          "mem-2",
          "--organization-id",
          "org-1",
          "--bank-account-id",
          "acc-1",
          "--card-level",
          "virtual",
        ],
        { from: "user" },
      );

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("card-1");
    });

    it("sends POST to the correct endpoint with card params", async () => {
      const card = makeCard();
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(
        [
          "card",
          "create",
          "--holder-id",
          "mem-1",
          "--initiator-id",
          "mem-2",
          "--organization-id",
          "org-1",
          "--bank-account-id",
          "acc-1",
          "--card-level",
          "virtual",
        ],
        { from: "user" },
      );

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/cards");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body as string) as { card: Record<string, unknown> };
      expect(body.card).toEqual(
        expect.objectContaining({
          holder_id: "mem-1",
          initiator_id: "mem-2",
          organization_id: "org-1",
          bank_account_id: "acc-1",
          card_level: "virtual",
        }),
      );
    });

    it("outputs json format when requested", async () => {
      const card = makeCard({ status: "pending" });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(
        [
          "--output",
          "json",
          "card",
          "create",
          "--holder-id",
          "mem-1",
          "--initiator-id",
          "mem-2",
          "--organization-id",
          "org-1",
          "--bank-account-id",
          "acc-1",
          "--card-level",
          "virtual",
        ],
        { from: "user" },
      );

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Card;
      expect(parsed.id).toBe("card-1");
    });

    it("sends optional params when provided", async () => {
      const card = makeCard();
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(
        [
          "card",
          "create",
          "--holder-id",
          "mem-1",
          "--initiator-id",
          "mem-2",
          "--organization-id",
          "org-1",
          "--bank-account-id",
          "acc-1",
          "--card-level",
          "flash",
          "--ship-to-business",
          "--atm-option",
          "true",
          "--nfc-option",
          "false",
          "--foreign-option",
          "true",
          "--online-option",
          "false",
          "--atm-monthly-limit",
          "1000",
          "--atm-daily-limit-option",
          "true",
          "--atm-daily-limit",
          "500",
          "--payment-monthly-limit",
          "5000",
          "--payment-daily-limit-option",
          "true",
          "--payment-daily-limit",
          "2000",
          "--payment-transaction-limit-option",
          "true",
          "--payment-transaction-limit",
          "1000",
          "--payment-lifespan-limit",
          "10000",
          "--pre-expires-at",
          "2026-12-31T00:00:00Z",
          "--active-days",
          "1",
          "2",
          "3",
          "--categories",
          "transport",
          "--card-design",
          "custom",
          "--type-of-print",
          "embossed",
        ],
        { from: "user" },
      );

      const [, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const body = JSON.parse(opts.body as string) as { card: Record<string, unknown> };
      expect(body.card).toEqual(
        expect.objectContaining({
          ship_to_business: true,
          atm_option: true,
          nfc_option: false,
          foreign_option: true,
          online_option: false,
          atm_monthly_limit: 1000,
          atm_daily_limit_option: true,
          atm_daily_limit: 500,
          payment_monthly_limit: 5000,
          payment_daily_limit_option: true,
          payment_daily_limit: 2000,
          payment_transaction_limit_option: true,
          payment_transaction_limit: 1000,
          payment_lifespan_limit: 10000,
          pre_expires_at: "2026-12-31T00:00:00Z",
          active_days: [1, 2, 3],
          categories: ["transport"],
          card_design: "custom",
          type_of_print: "embossed",
        }),
      );
    });
  });

  describe("card bulk-create", () => {
    it("bulk creates cards from a JSON file", async () => {
      const cards = [makeCard({ id: "card-a" }), makeCard({ id: "card-b" })];
      fetchSpy.mockImplementation(() => jsonResponse({ cards }));

      const { readFile } = await import("node:fs/promises");
      const readFileMock = vi.mocked(readFile);
      readFileMock.mockResolvedValue(
        JSON.stringify([
          {
            holder_id: "mem-1",
            initiator_id: "mem-2",
            organization_id: "org-1",
            bank_account_id: "acc-1",
            card_level: "virtual",
          },
        ]),
      );

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["card", "bulk-create", "--file", "cards.json"], { from: "user" });

      expect(readFileMock).toHaveBeenCalledWith("cards.json", "utf-8");
      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("card-a");
      expect(output).toContain("card-b");
    });

    it("outputs json format when requested", async () => {
      const cards = [makeCard({ id: "card-a" })];
      fetchSpy.mockImplementation(() => jsonResponse({ cards }));

      const { readFile } = await import("node:fs/promises");
      const readFileMock = vi.mocked(readFile);
      readFileMock.mockResolvedValue(
        JSON.stringify([
          {
            holder_id: "mem-1",
            initiator_id: "mem-2",
            organization_id: "org-1",
            bank_account_id: "acc-1",
            card_level: "virtual",
          },
        ]),
      );

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["--output", "json", "card", "bulk-create", "--file", "cards.json"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as unknown[];
      expect(parsed).toHaveLength(1);
    });
  });

  describe("card lock", () => {
    it("locks a card and outputs result", async () => {
      const card = makeCard({ status: "paused" });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["card", "lock", "card-1"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("card-1");
      expect(output).toContain("paused");
    });

    it("calls the correct API endpoint for lock", async () => {
      const card = makeCard({ status: "paused" });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["card", "lock", "card-1"], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/cards/card-1/lock");
      expect(opts.method).toBe("PUT");
    });

    it("outputs json format when requested", async () => {
      const card = makeCard({ status: "paused" });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["--output", "json", "card", "lock", "card-1"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Card;
      expect(parsed.id).toBe("card-1");
      expect(parsed.status).toBe("paused");
    });
  });

  describe("card unlock", () => {
    it("unlocks a card and outputs result", async () => {
      const card = makeCard({ status: "live" });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["card", "unlock", "card-1"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("card-1");
      expect(output).toContain("live");
    });

    it("calls the correct API endpoint for unlock", async () => {
      const card = makeCard({ status: "live" });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["card", "unlock", "card-1"], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/cards/card-1/unlock");
      expect(opts.method).toBe("PUT");
    });

    it("outputs json format when requested", async () => {
      const card = makeCard({ status: "live" });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["--output", "json", "card", "unlock", "card-1"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Card;
      expect(parsed.id).toBe("card-1");
      expect(parsed.status).toBe("live");
    });
  });

  describe("card report-lost", () => {
    it("reports a card as lost with --yes flag", async () => {
      const card = makeCard({ status: "lost" });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["card", "report-lost", "card-1", "--yes"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("card-1");
      expect(output).toContain("lost");
    });

    it("exits with error when --yes is not provided", async () => {
      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["card", "report-lost", "card-1"], { from: "user" });

      expect(stderrSpy).toHaveBeenCalled();
      const errorOutput = stderrSpy.mock.calls[0]?.[0] as string;
      expect(errorOutput).toContain("About to report card card-1 as lost");
      expect(errorOutput).toContain("--yes");
      expect(process.exitCode).toBe(1);
    });

    it("calls the correct API endpoint for report-lost", async () => {
      const card = makeCard({ status: "lost" });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["card", "report-lost", "card-1", "--yes"], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/cards/card-1/lost");
      expect(opts.method).toBe("PUT");
    });

    it("outputs json format when requested", async () => {
      const card = makeCard({ status: "lost" });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["--output", "json", "card", "report-lost", "card-1", "--yes"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Card;
      expect(parsed.id).toBe("card-1");
    });
  });

  describe("card report-stolen", () => {
    it("reports a card as stolen with --yes flag", async () => {
      const card = makeCard({ status: "stolen" });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["card", "report-stolen", "card-1", "--yes"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("card-1");
      expect(output).toContain("stolen");
    });

    it("exits with error when --yes is not provided", async () => {
      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["card", "report-stolen", "card-1"], { from: "user" });

      expect(stderrSpy).toHaveBeenCalled();
      const errorOutput = stderrSpy.mock.calls[0]?.[0] as string;
      expect(errorOutput).toContain("About to report card card-1 as stolen");
      expect(errorOutput).toContain("--yes");
      expect(process.exitCode).toBe(1);
    });

    it("calls the correct API endpoint for report-stolen", async () => {
      const card = makeCard({ status: "stolen" });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["card", "report-stolen", "card-1", "--yes"], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/cards/card-1/stolen");
      expect(opts.method).toBe("PUT");
    });

    it("outputs json format when requested", async () => {
      const card = makeCard({ status: "stolen" });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["--output", "json", "card", "report-stolen", "card-1", "--yes"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Card;
      expect(parsed.id).toBe("card-1");
    });
  });

  describe("card discard", () => {
    it("discards a card with --yes flag", async () => {
      const card = makeCard({ status: "discarded" });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["card", "discard", "card-1", "--yes"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("card-1");
      expect(output).toContain("discarded");
    });

    it("exits with error when --yes is not provided", async () => {
      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["card", "discard", "card-1"], { from: "user" });

      expect(stderrSpy).toHaveBeenCalled();
      const errorOutput = stderrSpy.mock.calls[0]?.[0] as string;
      expect(errorOutput).toContain("About to discard card card-1");
      expect(errorOutput).toContain("--yes");
      expect(process.exitCode).toBe(1);
    });

    it("calls the correct API endpoint for discard", async () => {
      const card = makeCard({ status: "discarded" });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["card", "discard", "card-1", "--yes"], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/cards/card-1/discard");
      expect(opts.method).toBe("PUT");
    });

    it("outputs json format when requested", async () => {
      const card = makeCard({ status: "discarded" });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["--output", "json", "card", "discard", "card-1", "--yes"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Card;
      expect(parsed.id).toBe("card-1");
    });
  });

  describe("card update-limits", () => {
    it("updates card limits and outputs result", async () => {
      const card = makeCard({ payment_monthly_limit: 3000 });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["card", "update-limits", "card-1", "--payment-monthly-limit", "3000"], {
        from: "user",
      });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("card-1");
    });

    it("sends PATCH to the correct endpoint with limit params", async () => {
      const card = makeCard({ payment_monthly_limit: 3000 });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["card", "update-limits", "card-1", "--payment-monthly-limit", "3000"], {
        from: "user",
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/cards/card-1/limits");
      expect(opts.method).toBe("PATCH");
      const body = JSON.parse(opts.body as string) as { card: Record<string, unknown> };
      expect(body.card).toEqual(expect.objectContaining({ payment_monthly_limit: 3000 }));
    });

    it("outputs json format when requested", async () => {
      const card = makeCard({ payment_monthly_limit: 3000 });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(
        ["--output", "json", "card", "update-limits", "card-1", "--payment-monthly-limit", "3000"],
        { from: "user" },
      );

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Card;
      expect(parsed.id).toBe("card-1");
    });

    it("sends all limit params when provided", async () => {
      const card = makeCard();
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(
        [
          "card",
          "update-limits",
          "card-1",
          "--atm-monthly-limit",
          "1000",
          "--atm-daily-limit-option",
          "true",
          "--atm-daily-limit",
          "500",
          "--payment-monthly-limit",
          "5000",
          "--payment-daily-limit-option",
          "true",
          "--payment-daily-limit",
          "2000",
          "--payment-transaction-limit-option",
          "true",
          "--payment-transaction-limit",
          "1000",
          "--payment-lifespan-limit",
          "10000",
        ],
        { from: "user" },
      );

      const [, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const body = JSON.parse(opts.body as string) as { card: Record<string, unknown> };
      expect(body.card).toEqual(
        expect.objectContaining({
          atm_monthly_limit: 1000,
          atm_daily_limit_option: true,
          atm_daily_limit: 500,
          payment_monthly_limit: 5000,
          payment_daily_limit_option: true,
          payment_daily_limit: 2000,
          payment_transaction_limit_option: true,
          payment_transaction_limit: 1000,
          payment_lifespan_limit: 10000,
        }),
      );
    });
  });

  describe("card update-nickname", () => {
    it("updates card nickname and outputs result", async () => {
      const card = makeCard({ nickname: "New Name" });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["card", "update-nickname", "card-1", "--nickname", "New Name"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("card-1");
      expect(output).toContain("New Name");
    });

    it("sends PATCH to the correct endpoint with nickname", async () => {
      const card = makeCard({ nickname: "New Name" });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["card", "update-nickname", "card-1", "--nickname", "New Name"], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/cards/card-1/nickname");
      expect(opts.method).toBe("PATCH");
      const body = JSON.parse(opts.body as string) as { card: Record<string, unknown> };
      expect(body.card).toEqual(expect.objectContaining({ nickname: "New Name" }));
    });

    it("outputs json format when requested", async () => {
      const card = makeCard({ nickname: "New Name" });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["--output", "json", "card", "update-nickname", "card-1", "--nickname", "New Name"], {
        from: "user",
      });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Card;
      expect(parsed.id).toBe("card-1");
      expect(parsed.nickname).toBe("New Name");
    });
  });

  describe("card update-options", () => {
    it("updates card options and outputs result", async () => {
      const card = makeCard({ atm_option: false, nfc_option: true, online_option: true, foreign_option: false });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(
        [
          "card",
          "update-options",
          "card-1",
          "--atm-option",
          "false",
          "--nfc-option",
          "true",
          "--online-option",
          "true",
          "--foreign-option",
          "false",
        ],
        { from: "user" },
      );

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("card-1");
    });

    it("sends PATCH to the correct endpoint with option params", async () => {
      const card = makeCard();
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(
        [
          "card",
          "update-options",
          "card-1",
          "--atm-option",
          "true",
          "--nfc-option",
          "true",
          "--online-option",
          "false",
          "--foreign-option",
          "true",
        ],
        { from: "user" },
      );

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/cards/card-1/options");
      expect(opts.method).toBe("PATCH");
      const body = JSON.parse(opts.body as string) as { card: Record<string, unknown> };
      expect(body.card).toEqual(
        expect.objectContaining({
          atm_option: true,
          nfc_option: true,
          online_option: false,
          foreign_option: true,
        }),
      );
    });

    it("outputs json format when requested", async () => {
      const card = makeCard();
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(
        [
          "--output",
          "json",
          "card",
          "update-options",
          "card-1",
          "--atm-option",
          "true",
          "--nfc-option",
          "true",
          "--online-option",
          "true",
          "--foreign-option",
          "true",
        ],
        { from: "user" },
      );

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Card;
      expect(parsed.id).toBe("card-1");
    });
  });

  describe("card update-restrictions", () => {
    it("updates card restrictions and outputs result", async () => {
      const card = makeCard({ active_days: [1, 2, 3], categories: ["transport"] });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(
        ["card", "update-restrictions", "card-1", "--active-days", "1", "2", "3", "--categories", "transport"],
        { from: "user" },
      );

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("card-1");
    });

    it("sends PATCH to the correct endpoint with restriction params", async () => {
      const card = makeCard({ active_days: [1, 2, 3], categories: ["transport"] });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(
        ["card", "update-restrictions", "card-1", "--active-days", "1", "2", "3", "--categories", "transport"],
        { from: "user" },
      );

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/cards/card-1/restrictions");
      expect(opts.method).toBe("PATCH");
      const body = JSON.parse(opts.body as string) as { card: Record<string, unknown> };
      expect(body.card).toEqual(
        expect.objectContaining({
          active_days: [1, 2, 3],
          categories: ["transport"],
        }),
      );
    });

    it("outputs json format when requested", async () => {
      const card = makeCard({ active_days: [1, 2, 3], categories: ["transport"] });
      fetchSpy.mockImplementation(() => jsonResponse({ card }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(
        [
          "--output",
          "json",
          "card",
          "update-restrictions",
          "card-1",
          "--active-days",
          "1",
          "2",
          "3",
          "--categories",
          "transport",
        ],
        { from: "user" },
      );

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Card;
      expect(parsed.id).toBe("card-1");
    });
  });

  describe("card iframe-url", () => {
    it("gets iframe url and outputs result", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ iframe_url: "https://secure.qonto.com/iframe/card-1" }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["card", "iframe-url", "card-1"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("https://secure.qonto.com/iframe/card-1");
    });

    it("calls the correct API endpoint for iframe-url", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ iframe_url: "https://secure.qonto.com/iframe/card-1" }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["card", "iframe-url", "card-1"], { from: "user" });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/cards/card-1/data_view");
    });

    it("outputs json format when requested", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ iframe_url: "https://secure.qonto.com/iframe/card-1" }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["--output", "json", "card", "iframe-url", "card-1"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as { iframe_url: string };
      expect(parsed.iframe_url).toBe("https://secure.qonto.com/iframe/card-1");
    });
  });

  describe("card appearances", () => {
    it("lists card appearances in table format", async () => {
      const appearances: CardTypeAppearances[] = [
        {
          card_type: "debit",
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
                  theme: "dark" as const,
                  gradient_hex_color: "#000000",
                  is_active: true,
                },
              ],
            },
          ],
        },
      ];
      fetchSpy.mockImplementation(() => jsonResponse({ card_type_appearances: appearances }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["card", "appearances"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("debit");
      expect(output).toContain("virtual");
      expect(output).toContain("default");
    });

    it("calls the correct API endpoint for appearances", async () => {
      fetchSpy.mockImplementation(() => jsonResponse({ card_type_appearances: [] }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["card", "appearances"], { from: "user" });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/cards/appearances");
    });

    it("outputs json format when requested", async () => {
      const appearances: CardTypeAppearances[] = [
        {
          card_type: "debit",
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
                  theme: "dark" as const,
                  gradient_hex_color: "#000000",
                  is_active: true,
                },
              ],
            },
          ],
        },
      ];
      fetchSpy.mockImplementation(() => jsonResponse({ card_type_appearances: appearances }));

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["--output", "json", "card", "appearances"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as CardTypeAppearances[];
      expect(parsed).toHaveLength(1);
      expect(parsed[0]?.card_type).toBe("debit");
    });
  });
});
