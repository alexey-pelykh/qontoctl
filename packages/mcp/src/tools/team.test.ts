// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { jsonResponse } from "@qontoctl/core/testing";
import { connectInMemory } from "../testing/mcp-helpers.js";

describe("team MCP tools", () => {
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

  describe("team_list", () => {
    it("returns teams from API", async () => {
      const teams = [
        { id: "team-1", name: "Engineering" },
        { id: "team-2", name: "Marketing" },
      ];
      fetchSpy.mockReturnValue(
        jsonResponse({
          teams,
          meta: {
            current_page: 1,
            next_page: null,
            prev_page: null,
            total_pages: 1,
            total_count: 2,
            per_page: 100,
          },
        }),
      );

      const result = await mcpClient.callTool({
        name: "team_list",
        arguments: {},
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as { teams: unknown[] };
      expect(parsed.teams).toHaveLength(2);
    });

    it("passes pagination params to API", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          teams: [],
          meta: {
            current_page: 3,
            next_page: null,
            prev_page: 2,
            total_pages: 3,
            total_count: 0,
            per_page: 25,
          },
        }),
      );

      await mcpClient.callTool({
        name: "team_list",
        arguments: { current_page: 3, per_page: 25 },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.searchParams.get("current_page")).toBe("3");
      expect(url.searchParams.get("per_page")).toBe("25");
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(
        jsonResponse({
          teams: [],
          meta: {
            current_page: 1,
            next_page: null,
            prev_page: null,
            total_pages: 1,
            total_count: 0,
            per_page: 100,
          },
        }),
      );

      await mcpClient.callTool({
        name: "team_list",
        arguments: {},
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/teams");
    });
  });

  describe("team_create", () => {
    const createdTeam = {
      id: "team-new",
      name: "Design",
    };

    it("creates a team", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ team: createdTeam }));

      const result = await mcpClient.callTool({
        name: "team_create",
        arguments: { name: "Design" },
      });

      const content = result.content as { type: string; text: string }[];
      expect(content).toHaveLength(1);
      const first = content[0] as { type: string; text: string };
      const parsed = JSON.parse(first.text) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", "team-new");
      expect(parsed).toHaveProperty("name", "Design");
    });

    it("sends POST with name body", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ team: createdTeam }));

      await mcpClient.callTool({
        name: "team_create",
        arguments: { name: "Design" },
      });

      const [url, opts] = fetchSpy.mock.calls[0] as [URL, RequestInit];
      expect(url.pathname).toBe("/v2/teams");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body as string) as Record<string, unknown>;
      expect(body).toEqual({ name: "Design" });
    });

    it("calls the correct API endpoint", async () => {
      fetchSpy.mockReturnValue(jsonResponse({ team: createdTeam }));

      await mcpClient.callTool({
        name: "team_create",
        arguments: { name: "Design" },
      });

      const [url] = fetchSpy.mock.calls[0] as [URL];
      expect(url.pathname).toBe("/v2/teams");
    });
  });
});
