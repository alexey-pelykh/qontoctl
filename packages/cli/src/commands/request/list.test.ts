// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "@qontoctl/core/testing";
import { registerRequestCommands } from "./index.js";
import type { PaginationMeta } from "../../pagination.js";

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

vi.mock("../../client.js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "../../client.js";
import { HttpClient } from "@qontoctl/core";

describe("request commands", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let client: HttpClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stdoutSpy: any;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    client = new HttpClient({
      baseUrl: "https://thirdparty.qonto.com",
      authorization: "slug:secret",
    });
    vi.mocked(createClient).mockResolvedValue(client);
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation((() => true) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("request list", () => {
    it("lists requests in table format", async () => {
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
        {
          id: "req-2",
          request_type: "flash_card",
          status: "approved",
          initiator_id: "user-2",
          approver_id: "user-1",
          note: "Travel expenses",
          declined_note: null,
          processed_at: "2026-01-16T12:00:00.000Z",
          created_at: "2026-01-15T11:00:00.000Z",
          payment_lifespan_limit: "500.00",
          pre_expires_at: "2026-02-15T00:00:00.000Z",
          currency: "EUR",
        },
      ];
      fetchSpy.mockReturnValue(
        jsonResponse({
          requests,
          meta: makeMeta({ total_count: 2 }),
        }),
      );

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      registerRequestCommands(program);
      program.exitOverride();

      await program.parseAsync(["request", "list"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("req-1");
      expect(output).toContain("transfer");
      expect(output).toContain("150.00 EUR");
      expect(output).toContain("pending");
      expect(output).toContain("req-2");
      expect(output).toContain("flash_card");
      expect(output).toContain("500.00 EUR");
    });

    it("lists requests in json format with full API fields", async () => {
      const requests = [
        {
          id: "req-1",
          request_type: "virtual_card",
          status: "pending",
          initiator_id: "user-1",
          approver_id: null,
          note: "Monthly subscription",
          declined_note: null,
          processed_at: null,
          created_at: "2026-01-15T10:00:00.000Z",
          payment_monthly_limit: "200.00",
          currency: "EUR",
          card_level: "virtual",
          card_design: "default",
        },
      ];
      fetchSpy.mockReturnValue(
        jsonResponse({
          requests,
          meta: makeMeta({ total_count: 1 }),
        }),
      );

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      registerRequestCommands(program);
      program.exitOverride();

      await program.parseAsync(["--output", "json", "request", "list"], {
        from: "user",
      });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as unknown[];
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toEqual({
        id: "req-1",
        request_type: "virtual_card",
        status: "pending",
        initiator_id: "user-1",
        approver_id: null,
        note: "Monthly subscription",
        declined_note: null,
        processed_at: null,
        created_at: "2026-01-15T10:00:00.000Z",
        payment_monthly_limit: "200.00",
        currency: "EUR",
        card_level: "virtual",
        card_design: "default",
      });
    });

    it("passes pagination options to API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          requests: [],
          meta: makeMeta(),
        }),
      );

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      registerRequestCommands(program);
      program.exitOverride();

      await program.parseAsync(["--page", "3", "--per-page", "25", "request", "list"], { from: "user" });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("current_page")).toBe("3");
      expect(url.searchParams.get("per_page")).toBe("25");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          requests: [],
          meta: makeMeta(),
        }),
      );

      const { createProgram } = await import("../../program.js");
      const program = createProgram();
      registerRequestCommands(program);
      program.exitOverride();

      await program.parseAsync(["request", "list"], { from: "user" });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/requests");
    });
  });
});
