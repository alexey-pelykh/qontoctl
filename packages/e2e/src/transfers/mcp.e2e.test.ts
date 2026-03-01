// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cliEnv, hasCredentials } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

interface TransferItem {
  readonly id: string;
  readonly beneficiary_id: string;
  readonly amount: number;
  readonly amount_currency: string;
  readonly status: "pending" | "processing" | "canceled" | "declined" | "settled";
  readonly reference: string;
  readonly bank_account_id: string;
}

interface TransferListResponse {
  readonly transfers: TransferItem[];
  readonly meta: {
    readonly current_page: number;
    readonly total_pages: number;
    readonly total_count: number;
  };
}

describe.skipIf(!hasCredentials())("transfer MCP tools (e2e)", () => {
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

  describe("transfer_list", () => {
    it("lists transfers", async () => {
      const result = await client.callTool({
        name: "transfer_list",
        arguments: {},
      });

      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);

      const textContent = result.content[0] as {
        type: string;
        text: string;
      };
      expect(textContent.type).toBe("text");

      const parsed = JSON.parse(textContent.text) as TransferListResponse;
      expect(parsed).toHaveProperty("transfers");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.transfers)).toBe(true);
    });

    it("lists transfers with pagination", async () => {
      const result = await client.callTool({
        name: "transfer_list",
        arguments: { per_page: 2, current_page: 1 },
      });

      const textContent = result.content[0] as {
        type: string;
        text: string;
      };
      const parsed = JSON.parse(textContent.text) as TransferListResponse;
      expect(parsed.transfers.length).toBeLessThanOrEqual(2);
      expect(parsed.meta.current_page).toBe(1);
    });

    it("filters by status", async () => {
      const result = await client.callTool({
        name: "transfer_list",
        arguments: { status: "settled" },
      });

      const textContent = result.content[0] as {
        type: string;
        text: string;
      };
      const parsed = JSON.parse(textContent.text) as TransferListResponse;
      for (const t of parsed.transfers) {
        expect(t.status).toBe("settled");
      }
    });
  });

  describe("transfer_show", () => {
    it("shows a transfer by ID", async () => {
      const listResult = await client.callTool({
        name: "transfer_list",
        arguments: { per_page: 1 },
      });
      const listText = listResult.content[0] as {
        type: string;
        text: string;
      };
      const listParsed = JSON.parse(listText.text) as TransferListResponse;
      const firstTransfer = listParsed.transfers[0];
      if (firstTransfer === undefined) return;

      const transferId = firstTransfer.id;
      const result = await client.callTool({
        name: "transfer_show",
        arguments: { id: transferId },
      });

      expect(result.content).toBeDefined();
      const textContent = result.content[0] as {
        type: string;
        text: string;
      };
      expect(textContent.type).toBe("text");

      const transfer = JSON.parse(textContent.text) as TransferItem;
      expect(transfer.id).toBe(transferId);
      expect(transfer).toHaveProperty("amount");
      expect(transfer).toHaveProperty("beneficiary_id");
      expect(transfer).toHaveProperty("status");
      expect(transfer).toHaveProperty("amount_currency");
    });
  });
});
