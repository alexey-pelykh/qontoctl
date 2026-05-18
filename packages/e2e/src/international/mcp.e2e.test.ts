// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { IntlCurrencySchema, IntlEligibilitySchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CLI_PATH, firstTextFromMcpResult, skipIfToolError } from "../helpers.js";
import { cliEnv, hasOAuthCredentials, pinAuthPreference } from "../sandbox.js";

describe.skipIf(!hasOAuthCredentials())("international MCP tools (e2e)", () => {
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

  describe("intl_eligibility", () => {
    it("returns eligibility status (flat shape)", async (ctx) => {
      const result = await client.callTool({
        name: "intl_eligibility",
        arguments: {},
      });

      skipIfToolError(result, ctx, "feature-not-supported", "intl_eligibility");

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as Record<string, unknown>;
      IntlEligibilitySchema.parse(parsed);
      expect(parsed).toHaveProperty("status");
    });
  });

  describe("intl_currencies", () => {
    it("returns a list of currencies", async (ctx) => {
      const result = await client.callTool({
        name: "intl_currencies",
        arguments: { source: "EUR" },
      });

      skipIfToolError(result, ctx, "feature-not-supported", "intl_currencies");

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
      const first = parsed[0];
      if (first !== undefined) {
        IntlCurrencySchema.parse(first);
      }
    });

    it("supports search filter", async (ctx) => {
      const result = await client.callTool({
        name: "intl_currencies",
        arguments: { source: "EUR", search: "EUR" },
      });

      skipIfToolError(result, ctx, "feature-not-supported", "intl_currencies");

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as { currency_code: string; country_code: string }[];
      expect(Array.isArray(parsed)).toBe(true);
      for (const c of parsed) {
        const match = c.currency_code.toLowerCase().includes("eur") || c.country_code.toLowerCase().includes("eur");
        expect(match).toBe(true);
      }
    });
  });
});
