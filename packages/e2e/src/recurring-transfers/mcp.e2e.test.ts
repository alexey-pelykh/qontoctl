// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { RecurringTransferListResponseSchema, RecurringTransferSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cliEnv, hasCredentials } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

interface RecurringTransferItem {
  readonly id: string;
  readonly amount: number;
  readonly amount_currency: string;
  readonly beneficiary_id: string;
  readonly frequency: string;
  readonly next_execution_date: string;
  readonly status: string;
}

interface RecurringTransferListResponse {
  readonly recurring_transfers: RecurringTransferItem[];
  readonly meta: {
    readonly current_page: number;
    readonly total_pages: number;
    readonly total_count: number;
  };
}

describe.skipIf(!hasCredentials())("recurring-transfer MCP tools (e2e)", () => {
  let client: Client;
  let transport: StdioClientTransport;

  beforeAll(async () => {
    transport = new StdioClientTransport({
      command: "node",
      args: [CLI_PATH, "mcp"],
      env: cliEnv(),
      stderr: "pipe",
    });

    client = new Client({
      name: "e2e-test-client",
      version: "0.0.0",
    });

    await client.connect(transport);
  });

  afterAll(async () => {
    await client.close();
  });

  describe("recurring_transfer_list", () => {
    it("lists recurring transfers", async () => {
      const result = await client.callTool({
        name: "recurring_transfer_list",
        arguments: {},
      });

      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);

      const textContent = result.content[0] as {
        type: string;
        text: string;
      };
      expect(textContent.type).toBe("text");

      const parsed = JSON.parse(textContent.text) as RecurringTransferListResponse;
      RecurringTransferListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("recurring_transfers");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.recurring_transfers)).toBe(true);
    });

    it("lists recurring transfers with pagination", async () => {
      const result = await client.callTool({
        name: "recurring_transfer_list",
        arguments: { per_page: 2, current_page: 1 },
      });

      const textContent = result.content[0] as {
        type: string;
        text: string;
      };
      const parsed = JSON.parse(textContent.text) as RecurringTransferListResponse;
      expect(parsed.recurring_transfers.length).toBeLessThanOrEqual(2);
      expect(parsed.meta.current_page).toBe(1);
    });
  });

  describe("recurring_transfer_show", () => {
    it("shows a recurring transfer by ID", async () => {
      const listResult = await client.callTool({
        name: "recurring_transfer_list",
        arguments: { per_page: 1 },
      });
      const listText = listResult.content[0] as {
        type: string;
        text: string;
      };
      const listParsed = JSON.parse(listText.text) as RecurringTransferListResponse;
      const first = listParsed.recurring_transfers[0];
      if (first === undefined) return;

      const result = await client.callTool({
        name: "recurring_transfer_show",
        arguments: { id: first.id },
      });

      expect(result.content).toBeDefined();
      const textContent = result.content[0] as {
        type: string;
        text: string;
      };
      expect(textContent.type).toBe("text");

      const rt = JSON.parse(textContent.text) as RecurringTransferItem;
      RecurringTransferSchema.parse(rt);
      expect(rt.id).toBe(first.id);
      expect(rt).toHaveProperty("amount");
      expect(rt).toHaveProperty("frequency");
    });
  });
});
