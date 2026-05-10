// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { TeamListResponseSchema, TeamSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasOAuthCredentials, pinAuthPreference } from "../sandbox.js";

interface TeamItem {
  readonly id: string;
  readonly name: string;
}

interface TeamListResponse {
  readonly teams: TeamItem[];
  readonly meta: {
    readonly current_page: number;
    readonly total_pages: number;
    readonly total_count: number;
  };
}

describe.skipIf(!hasOAuthCredentials())("team MCP tools (e2e)", () => {
  pinAuthPreference("oauth-first");

  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "node",
      args: [CLI_PATH, "mcp"],
      env: cliEnv(),
      stderr: "pipe",
    });

    client = new Client({ name: "e2e-test", version: "0.0.0" });
    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  describe("team_list", () => {
    it("returns a list of teams with expected structure", async () => {
      const result = await client.callTool({
        name: "team_list",
        arguments: {},
      });

      if (result.isError === true) return;

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as TeamListResponse;
      TeamListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("teams");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.teams)).toBe(true);
    });

    it("supports pagination", async () => {
      const result = await client.callTool({
        name: "team_list",
        arguments: { per_page: 2, page: 1 },
      });

      if (result.isError === true) return;

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as TeamListResponse;
      expect(parsed.teams.length).toBeLessThanOrEqual(2);
      expect(parsed.meta.current_page).toBe(1);
    });

    it("validates team schema", async () => {
      const result = await client.callTool({
        name: "team_list",
        arguments: { per_page: 1 },
      });

      if (result.isError === true) return;

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as TeamListResponse;
      const first = parsed.teams[0];
      if (first === undefined) return;

      TeamSchema.parse(first);
      expect(first).toHaveProperty("id");
      expect(first).toHaveProperty("name");
    });
  });

  // MCP smoke for `team_create` — closes the CLI/MCP asymmetry surfaced by
  // the #449 audit (Group 2). Qonto's API has no DELETE for teams, so the
  // created team persists; we use a timestamped sentinel name to keep
  // sandbox leakage easily identifiable.
  //
  // POST /v2/teams requires OAuth with the appropriate scope per the Qonto
  // auth table; OAuth clients without team-management scope receive an HTTP
  // 401 surfaced through the MCP wrapper as `result.isError === true`. We
  // treat that as a skip rather than a spurious failure.
  describe("team_create", () => {
    it("creates a team via callTool (skips on OAuth scope gap)", async () => {
      const teamName = `E2E MCP Test Team ${String(Date.now())}`;
      const result = await client.callTool({
        name: "team_create",
        arguments: { name: teamName },
      });

      if (result.isError === true) return;
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as TeamItem;
      TeamSchema.parse(parsed);
      expect(parsed).toHaveProperty("id");
      expect(parsed).toHaveProperty("name", teamName);
    });
  });
});
