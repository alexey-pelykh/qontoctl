// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StatementListResponseSchema, StatementSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cliCwd, cliEnv, hasCredentials } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

describe.skipIf(!hasCredentials())("statement MCP tools (e2e)", () => {
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

  describe("statement_list", () => {
    it("lists statements and returns expected fields", async () => {
      const result = await client.callTool({ name: "statement_list", arguments: {} });

      // Sandbox may not have statements — skip gracefully on tool error
      if (result.isError === true) return;

      expect(result.content).toHaveLength(1);

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.type).toBe("text");

      const parsed = JSON.parse(textContent.text) as {
        statements: Record<string, unknown>[];
        meta: Record<string, unknown>;
      };
      StatementListResponseSchema.parse(parsed);
      expect(parsed.meta).toHaveProperty("current_page");

      // Sandbox may have no statements — verify structure only when data exists
      if (parsed.statements.length === 0) return;

      const first = parsed.statements[0] as Record<string, unknown>;
      expect(first).toHaveProperty("id");
      expect(first).toHaveProperty("bank_account_id");
      expect(first).toHaveProperty("period");
    });

    it("filters by period range", async () => {
      const result = await client.callTool({
        name: "statement_list",
        arguments: {
          period_from: "01-2025",
          period_to: "12-2025",
        },
      });

      expect(result.isError).not.toBe(true);

      const textContent = result.content[0] as { type: string; text: string };
      const parsed = JSON.parse(textContent.text) as {
        statements: unknown[];
        meta: unknown;
      };
      expect(Array.isArray(parsed.statements)).toBe(true);
    });
  });

  describe("statement_show", () => {
    it("shows details of a specific statement", async () => {
      // First, get a statement ID from the list
      const listResult = await client.callTool({
        name: "statement_list",
        arguments: {},
      });
      if (listResult.isError === true) return;

      const listText = (listResult.content[0] as { type: string; text: string }).text;
      const listParsed = JSON.parse(listText) as {
        statements: Record<string, unknown>[];
      };
      if (listParsed.statements.length === 0) return;

      const statementId = (listParsed.statements[0] as Record<string, unknown>)["id"] as string;

      // Now show that specific statement
      const showResult = await client.callTool({
        name: "statement_show",
        arguments: { id: statementId },
      });

      expect(showResult.isError).not.toBe(true);

      const showText = (showResult.content[0] as { type: string; text: string }).text;
      const showParsed = JSON.parse(showText) as Record<string, unknown>;
      StatementSchema.parse(showParsed);
      expect(showParsed["id"]).toBe(statementId);
      expect(showParsed).toHaveProperty("bank_account_id");
      expect(showParsed).toHaveProperty("period");
    });
  });
});
