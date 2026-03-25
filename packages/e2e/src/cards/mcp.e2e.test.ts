// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CardListResponseSchema, CardSchema } from "@qontoctl/core";
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

interface CardItem {
  readonly id: string;
  readonly status: string;
  readonly card_level: string;
}

interface CardListResponse {
  readonly cards: CardItem[];
  readonly meta: {
    readonly current_page: number;
    readonly total_pages: number;
    readonly total_count: number;
  };
}

describe.skipIf(!hasCredentials())("card MCP tools (e2e)", () => {
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

  describe("card_list", () => {
    it("returns a list of cards with expected structure", async () => {
      const result = await client.callTool({
        name: "card_list",
        arguments: {},
      });

      if (result.isError === true) return;

      const parsed = JSON.parse(firstText(result)) as CardListResponse;
      CardListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("cards");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.cards)).toBe(true);
    });

    it("supports pagination", async () => {
      const result = await client.callTool({
        name: "card_list",
        arguments: { per_page: 2, page: 1 },
      });

      if (result.isError === true) return;

      const parsed = JSON.parse(firstText(result)) as CardListResponse;
      expect(parsed.cards.length).toBeLessThanOrEqual(2);
      expect(parsed.meta.current_page).toBe(1);
    });

    it("filters by status", async () => {
      const result = await client.callTool({
        name: "card_list",
        arguments: { statuses: ["live"] },
      });

      if (result.isError === true) return;

      const parsed = JSON.parse(firstText(result)) as CardListResponse;
      for (const c of parsed.cards) {
        expect(c.status).toBe("live");
      }
    });
  });

  describe("card_show", () => {
    it("shows a card by ID", async () => {
      const listResult = await client.callTool({
        name: "card_list",
        arguments: { per_page: 1 },
      });
      if (listResult.isError === true) return;

      const listParsed = JSON.parse(firstText(listResult)) as CardListResponse;
      const first = listParsed.cards[0];
      if (first === undefined) return;

      const result = await client.callTool({
        name: "card_show",
        arguments: { id: first.id },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstText(result)) as CardItem;
      CardSchema.parse(parsed);
      expect(parsed.id).toBe(first.id);
      expect(parsed).toHaveProperty("status");
      expect(parsed).toHaveProperty("card_level");
    });
  });

  describe("card_appearances", () => {
    it("returns available card appearances", async () => {
      const result = await client.callTool({
        name: "card_appearances",
        arguments: {},
      });

      if (result.isError === true) return;

      const parsed = JSON.parse(firstText(result)) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
    });
  });
});
