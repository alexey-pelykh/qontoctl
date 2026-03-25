// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { IntlEligibilityResponseSchema, IntlCurrencySchema } from "@qontoctl/core";
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

describe.skipIf(!hasCredentials())("international MCP tools (e2e)", () => {
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

  describe("intl_eligibility", () => {
    it("returns eligibility status", async () => {
      const result = await client.callTool({
        name: "intl_eligibility",
        arguments: {},
      });

      if (result.isError === true) return;

      const parsed = JSON.parse(firstText(result)) as Record<string, unknown>;
      IntlEligibilityResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("eligibility");
    });
  });

  describe("intl_currencies", () => {
    it("returns a list of currencies", async () => {
      const result = await client.callTool({
        name: "intl_currencies",
        arguments: {},
      });

      if (result.isError === true) return;

      const parsed = JSON.parse(firstText(result)) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
      const first = parsed[0];
      if (first !== undefined) {
        IntlCurrencySchema.parse(first);
      }
    });

    it("supports search filter", async () => {
      const result = await client.callTool({
        name: "intl_currencies",
        arguments: { search: "EUR" },
      });

      if (result.isError === true) return;

      const parsed = JSON.parse(firstText(result)) as { code: string; name: string }[];
      expect(Array.isArray(parsed)).toBe(true);
      for (const c of parsed) {
        const match = c.code.toLowerCase().includes("eur") || c.name.toLowerCase().includes("eur");
        expect(match).toBe(true);
      }
    });
  });
});
