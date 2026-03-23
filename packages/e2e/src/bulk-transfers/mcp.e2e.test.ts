// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { BulkTransferListResponseSchema, BulkTransferSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cliEnv, hasCredentials } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

interface BulkTransferItem {
  readonly id: string;
  readonly initiator_id: string;
  readonly total_count: number;
  readonly completed_count: number;
  readonly pending_count: number;
  readonly failed_count: number;
}

interface BulkTransferListResponse {
  readonly bulk_transfers: BulkTransferItem[];
  readonly meta: {
    readonly current_page: number;
    readonly total_pages: number;
    readonly total_count: number;
  };
}

describe.skipIf(!hasCredentials())("bulk-transfer MCP tools (e2e)", () => {
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

  describe("bulk_transfer_list", () => {
    it("lists bulk transfers", async () => {
      const result = await client.callTool({
        name: "bulk_transfer_list",
        arguments: {},
      });

      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);

      const textContent = result.content[0] as {
        type: string;
        text: string;
      };
      expect(textContent.type).toBe("text");

      const parsed = JSON.parse(textContent.text) as BulkTransferListResponse;
      BulkTransferListResponseSchema.parse(parsed);
      expect(parsed).toHaveProperty("bulk_transfers");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.bulk_transfers)).toBe(true);
    });

    it("lists bulk transfers with pagination", async () => {
      const result = await client.callTool({
        name: "bulk_transfer_list",
        arguments: { per_page: 2, page: 1 },
      });

      const textContent = result.content[0] as {
        type: string;
        text: string;
      };
      const parsed = JSON.parse(textContent.text) as BulkTransferListResponse;
      expect(parsed.bulk_transfers.length).toBeLessThanOrEqual(2);
      expect(parsed.meta.current_page).toBe(1);
    });
  });

  describe("bulk_transfer_show", () => {
    it("shows a bulk transfer by ID", async () => {
      const listResult = await client.callTool({
        name: "bulk_transfer_list",
        arguments: { per_page: 1 },
      });
      const listText = listResult.content[0] as {
        type: string;
        text: string;
      };
      const listParsed = JSON.parse(listText.text) as BulkTransferListResponse;
      const first = listParsed.bulk_transfers[0];
      if (first === undefined) return;

      const result = await client.callTool({
        name: "bulk_transfer_show",
        arguments: { id: first.id },
      });

      expect(result.content).toBeDefined();
      const textContent = result.content[0] as {
        type: string;
        text: string;
      };
      expect(textContent.type).toBe("text");

      const bt = JSON.parse(textContent.text) as BulkTransferItem;
      BulkTransferSchema.parse(bt);
      expect(bt.id).toBe(first.id);
      expect(bt).toHaveProperty("total_count");
    });
  });
});
