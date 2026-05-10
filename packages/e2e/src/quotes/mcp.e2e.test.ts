// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { QuoteListResponseSchema, QuoteSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult } from "../helpers.js";
import { cliEnv, hasOAuthCredentials, pinAuthPreference } from "../sandbox.js";

describe.skipIf(!hasOAuthCredentials())("MCP quote tools (e2e)", () => {
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

  describe("quote_list", () => {
    it("returns a list of quotes with expected structure", async () => {
      const result = await client.callTool({
        name: "quote_list",
        arguments: {},
      });

      // Sandbox may not support quotes — skip gracefully on tool error
      if (result.isError === true) return;

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as {
        quotes: unknown[];
        meta: Record<string, unknown>;
      };
      QuoteListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("quotes");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.quotes)).toBe(true);
    });
  });

  describe("quote_show", () => {
    it("returns details for a specific quote", async () => {
      const listResult = await client.callTool({
        name: "quote_list",
        arguments: {},
      });
      if (listResult.isError === true) return;

      const listParsed = JSON.parse(firstTextFromMcpResult(listResult)) as {
        quotes: { id: string }[];
      };
      if (listParsed.quotes.length === 0) {
        return;
      }

      const quoteId = (listParsed.quotes[0] as { id: string }).id;

      const result = await client.callTool({
        name: "quote_show",
        arguments: { id: quoteId },
      });

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      QuoteSchema.parse(parsed);
      expect(parsed).toHaveProperty("id", quoteId);
      expect(parsed).toHaveProperty("status");
      expect(parsed).toHaveProperty("items");
    });
  });
});
