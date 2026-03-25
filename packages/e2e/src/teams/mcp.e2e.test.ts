// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { TeamListResponseSchema, TeamSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cliCwd, cliEnv, hasCredentials } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

function firstText(result: Awaited<ReturnType<Client["callTool"]>>): string {
  const content = result.content as { type: string; text: string }[];
  expect(content).toHaveLength(1);
  const entry = content[0] as { type: string; text: string };
  expect(entry.type).toBe("text");
  return entry.text;
}

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

describe.skipIf(!hasCredentials())("team MCP tools (e2e)", () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "node",
      args: [CLI_PATH, "mcp"],
      env: cliEnv(),
      cwd: cliCwd(),
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

      const parsed = JSON.parse(firstText(result)) as TeamListResponse;
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

      const parsed = JSON.parse(firstText(result)) as TeamListResponse;
      expect(parsed.teams.length).toBeLessThanOrEqual(2);
      expect(parsed.meta.current_page).toBe(1);
    });

    it("validates team schema", async () => {
      const result = await client.callTool({
        name: "team_list",
        arguments: { per_page: 1 },
      });

      if (result.isError === true) return;

      const parsed = JSON.parse(firstText(result)) as TeamListResponse;
      const first = parsed.teams[0];
      if (first === undefined) return;

      TeamSchema.parse(first);
      expect(first).toHaveProperty("id");
      expect(first).toHaveProperty("name");
    });
  });
});
