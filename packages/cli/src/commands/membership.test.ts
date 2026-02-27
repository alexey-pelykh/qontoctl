// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "@qontoctl/core/testing";
import { createMembershipCommand } from "./membership.js";
import type { PaginationMeta } from "../pagination.js";

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

vi.mock("../client.js", () => ({
  createClient: vi.fn(),
}));

import { createClient } from "../client.js";
import { HttpClient } from "@qontoctl/core";

describe("membership commands", () => {
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
    stdoutSpy = vi
      .spyOn(process.stdout, "write")
      .mockImplementation((() => true) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("membership list", () => {
    it("lists memberships in table format", async () => {
      const memberships = [
        {
          id: "mem-1",
          first_name: "Alice",
          last_name: "Smith",
          role: "owner" as const,
          team_id: "team-1",
          residence_country: "FR",
          birthdate: "1990-01-01",
          nationality: "FR",
          birth_country: "FR",
          ubo: true,
          status: "active",
        },
        {
          id: "mem-2",
          first_name: "Bob",
          last_name: "Jones",
          role: "employee" as const,
          team_id: "team-2",
          residence_country: "DE",
          birthdate: null,
          nationality: null,
          birth_country: null,
          ubo: false,
          status: "active",
        },
      ];
      fetchSpy.mockReturnValue(
        jsonResponse({
          memberships,
          meta: makeMeta({ total_count: 2 }),
        }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createMembershipCommand());
      program.exitOverride();

      await program.parseAsync(["membership", "list"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("mem-1");
      expect(output).toContain("Alice");
      expect(output).toContain("Smith");
      expect(output).toContain("owner");
      expect(output).toContain("mem-2");
      expect(output).toContain("Bob");
    });

    it("lists memberships in json format", async () => {
      const memberships = [
        {
          id: "mem-1",
          first_name: "Alice",
          last_name: "Smith",
          role: "admin" as const,
          team_id: "team-1",
          residence_country: null,
          birthdate: null,
          nationality: null,
          birth_country: null,
          ubo: null,
          status: "active",
        },
      ];
      fetchSpy.mockReturnValue(
        jsonResponse({
          memberships,
          meta: makeMeta({ total_count: 1 }),
        }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createMembershipCommand());
      program.exitOverride();

      await program.parseAsync(["--output", "json", "membership", "list"], {
        from: "user",
      });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as unknown[];
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toEqual({
        id: "mem-1",
        first_name: "Alice",
        last_name: "Smith",
        role: "admin",
        team_id: "team-1",
        status: "active",
      });
    });

    it("passes pagination options to API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          memberships: [],
          meta: makeMeta(),
        }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createMembershipCommand());
      program.exitOverride();

      await program.parseAsync(
        ["--page", "3", "--per-page", "25", "membership", "list"],
        { from: "user" },
      );

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("current_page")).toBe("3");
      expect(url.searchParams.get("per_page")).toBe("25");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          memberships: [],
          meta: makeMeta(),
        }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createMembershipCommand());
      program.exitOverride();

      await program.parseAsync(["membership", "list"], { from: "user" });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/memberships");
    });
  });
});
