// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { jsonResponse } from "@qontoctl/core/testing";
import { createLabelCommand } from "./label.js";
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

describe("label commands", () => {
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

  describe("label list", () => {
    it("lists labels in table format", async () => {
      const labels = [
        { id: "abc-123", name: "Marketing", parent_id: null },
        { id: "def-456", name: "Digital", parent_id: "abc-123" },
      ];
      fetchSpy.mockReturnValue(
        jsonResponse({
          labels,
          meta: makeMeta({ total_count: 2 }),
        }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createLabelCommand());
      program.exitOverride();

      await program.parseAsync(["label", "list"], { from: "user" });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("abc-123");
      expect(output).toContain("Marketing");
      expect(output).toContain("def-456");
      expect(output).toContain("Digital");
    });

    it("lists labels in json format with full API fields", async () => {
      const labels = [
        { id: "abc-123", name: "Marketing", parent_id: null },
      ];
      fetchSpy.mockReturnValue(
        jsonResponse({
          labels,
          meta: makeMeta({ total_count: 1 }),
        }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createLabelCommand());
      program.exitOverride();

      await program.parseAsync(["--output", "json", "label", "list"], {
        from: "user",
      });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as unknown[];
      expect(parsed).toHaveLength(1);
      expect(parsed[0]).toEqual({
        id: "abc-123",
        name: "Marketing",
        parent_id: null,
      });
    });

    it("passes pagination options to API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          labels: [],
          meta: makeMeta(),
        }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createLabelCommand());
      program.exitOverride();

      await program.parseAsync(
        ["--page", "2", "--per-page", "50", "label", "list"],
        { from: "user" },
      );

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("current_page")).toBe("2");
      expect(url.searchParams.get("per_page")).toBe("50");
    });
  });

  describe("label show", () => {
    it("shows label details in table format", async () => {
      const label = {
        id: "abc-123",
        name: "Marketing",
        parent_id: "parent-id",
      };
      fetchSpy.mockReturnValue(jsonResponse({ label }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createLabelCommand());
      program.exitOverride();

      await program.parseAsync(["label", "show", "abc-123"], {
        from: "user",
      });

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      expect(output).toContain("abc-123");
      expect(output).toContain("Marketing");
      expect(output).toContain("parent-id");
    });

    it("shows label with full API fields in json format", async () => {
      const label = {
        id: "abc-123",
        name: "Root Label",
        parent_id: null,
      };
      fetchSpy.mockReturnValue(jsonResponse({ label }));

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createLabelCommand());
      program.exitOverride();

      await program.parseAsync(
        ["--output", "json", "label", "show", "abc-123"],
        { from: "user" },
      );

      expect(stdoutSpy).toHaveBeenCalled();
      const output = stdoutSpy.mock.calls[0]?.[0] as string;
      const parsed = JSON.parse(output) as unknown;
      expect(parsed).toEqual({
        id: "abc-123",
        name: "Root Label",
        parent_id: null,
      });
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          label: { id: "abc-123", name: "Test", parent_id: null },
        }),
      );

      const { createProgram } = await import("../program.js");
      const program = createProgram();
      program.addCommand(createLabelCommand());
      program.exitOverride();

      await program.parseAsync(["label", "show", "abc-123"], {
        from: "user",
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/labels/abc-123");
    });
  });
});
