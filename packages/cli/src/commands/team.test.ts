// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "@qontoctl/core/testing";
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

describe("team commands", () => {
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

  describe("team list", () => {
    it("lists teams in table format", async () => {
      const teams = [
        { id: "team-1", name: "Engineering" },
        { id: "team-2", name: "Marketing" },
      ];
      fetchSpy.mockReturnValue(
        jsonResponse({
          teams,
          meta: makeMeta({ total_count: 2 }),
        }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["team", "list"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("team-1");
      expect(output).toContain("Engineering");
      expect(output).toContain("team-2");
      expect(output).toContain("Marketing");
    });

    it("lists teams in json format with full API fields", async () => {
      const teams = [{ id: "team-1", name: "Engineering" }];
      fetchSpy.mockReturnValue(
        jsonResponse({
          teams,
          meta: makeMeta({ total_count: 1 }),
        }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["--output", "json", "team", "list"], {
        from: "user",
      });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as unknown[];
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toEqual({
        id: "team-1",
        name: "Engineering",
      });
    });

    it("passes pagination options to API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          teams: [],
          meta: makeMeta(),
        }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["--page", "3", "--per-page", "25", "team", "list"], { from: "user" });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("current_page")).toBe("3");
      expect(url.searchParams.get("per_page")).toBe("25");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          teams: [],
          meta: makeMeta(),
        }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["team", "list"], { from: "user" });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/teams");
    });
  });

  describe("team create", () => {
    const createdTeam = {
      id: "team-new",
      name: "Design",
    };

    it("creates a team in json format", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ team: createdTeam }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["--output", "json", "team", "create", "--name", "Design"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", "team-new");
      expect(parsed).toHaveProperty("name", "Design");
    });

    it("creates a team in table format", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ team: createdTeam }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["team", "create", "--name", "Design"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("team-new");
      expect(output).toContain("Design");
    });

    it("sends POST with name body to the correct endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ team: createdTeam }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["team", "create", "--name", "Design"], { from: "user" });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/teams");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toEqual({ name: "Design" });
    });

    it("passes idempotency key when provided", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ team: createdTeam }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.exitOverride();

      await program.parseAsync(["team", "create", "--name", "Design", "--idempotency-key", "key-abc-123"], {
        from: "user",
      });

      const [, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      const headers = opts.headers as Record<string, string>;
      expect(headers["X-Qonto-Idempotency-Key"]).toBe("key-abc-123");
    });
  });
});
