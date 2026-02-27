// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cliEnv, hasCredentials } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

interface TransactionItem {
  readonly id: string;
  readonly amount: number;
  readonly side: "credit" | "debit";
  readonly status: "pending" | "declined" | "completed";
  readonly currency: string;
  readonly bank_account_id: string;
  readonly labels?: readonly { id: string; name: string }[];
  readonly attachments?: readonly unknown[];
}

interface TransactionListResponse {
  readonly transactions: TransactionItem[];
  readonly meta: {
    readonly current_page: number;
    readonly total_pages: number;
    readonly total_count: number;
  };
}

describe.skipIf(!hasCredentials())("transaction MCP tools (e2e)", () => {
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

  describe("transaction_list", () => {
    it("lists transactions", async () => {
      const result = await client.callTool({
        name: "transaction_list",
        arguments: {},
      });

      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);

      const textContent = result.content[0] as {
        type: string;
        text: string;
      };
      expect(textContent.type).toBe("text");

      const parsed = JSON.parse(textContent.text) as TransactionListResponse;
      expect(parsed).toHaveProperty("transactions");
      expect(parsed).toHaveProperty("meta");
      expect(Array.isArray(parsed.transactions)).toBe(true);
    });

    it("lists transactions with pagination", async () => {
      const result = await client.callTool({
        name: "transaction_list",
        arguments: { per_page: 2, current_page: 1 },
      });

      const textContent = result.content[0] as {
        type: string;
        text: string;
      };
      const parsed = JSON.parse(textContent.text) as TransactionListResponse;
      expect(parsed.transactions.length).toBeLessThanOrEqual(2);
      expect(parsed.meta.current_page).toBe(1);
    });

    it("filters by status", async () => {
      const result = await client.callTool({
        name: "transaction_list",
        arguments: { status: "completed" },
      });

      const textContent = result.content[0] as {
        type: string;
        text: string;
      };
      const parsed = JSON.parse(textContent.text) as TransactionListResponse;
      for (const txn of parsed.transactions) {
        expect(txn.status).toBe("completed");
      }
    });

    it("filters by side", async () => {
      const result = await client.callTool({
        name: "transaction_list",
        arguments: { side: "debit" },
      });

      const textContent = result.content[0] as {
        type: string;
        text: string;
      };
      const parsed = JSON.parse(textContent.text) as TransactionListResponse;
      for (const txn of parsed.transactions) {
        expect(txn.side).toBe("debit");
      }
    });

    it("filters by date range", async () => {
      const result = await client.callTool({
        name: "transaction_list",
        arguments: {
          settled_at_from: "2020-01-01",
          settled_at_to: "2026-12-31",
        },
      });

      const textContent = result.content[0] as {
        type: string;
        text: string;
      };
      const parsed = JSON.parse(textContent.text) as TransactionListResponse;
      expect(parsed).toHaveProperty("transactions");
      expect(Array.isArray(parsed.transactions)).toBe(true);
    });

    it("filters by bank account ID", async () => {
      // First get a transaction to extract bank_account_id
      const listResult = await client.callTool({
        name: "transaction_list",
        arguments: { per_page: 1 },
      });
      const listText = listResult.content[0] as {
        type: string;
        text: string;
      };
      const listParsed = JSON.parse(listText.text) as TransactionListResponse;
      const firstTxn = listParsed.transactions[0];
      if (firstTxn === undefined) return;

      const bankAccountId = firstTxn.bank_account_id;
      const result = await client.callTool({
        name: "transaction_list",
        arguments: { bank_account_id: bankAccountId },
      });

      const textContent = result.content[0] as {
        type: string;
        text: string;
      };
      const parsed = JSON.parse(textContent.text) as TransactionListResponse;
      for (const txn of parsed.transactions) {
        expect(txn.bank_account_id).toBe(bankAccountId);
      }
    });
  });

  describe("transaction_show", () => {
    it("shows a transaction by ID", async () => {
      // First get a transaction ID
      const listResult = await client.callTool({
        name: "transaction_list",
        arguments: { per_page: 1 },
      });
      const listText = listResult.content[0] as {
        type: string;
        text: string;
      };
      const listParsed = JSON.parse(listText.text) as TransactionListResponse;
      const firstTxn = listParsed.transactions[0];
      if (firstTxn === undefined) return;

      const txnId = firstTxn.id;
      const result = await client.callTool({
        name: "transaction_show",
        arguments: { id: txnId },
      });

      expect(result.content).toBeDefined();
      const textContent = result.content[0] as {
        type: string;
        text: string;
      };
      expect(textContent.type).toBe("text");

      const transaction = JSON.parse(textContent.text) as TransactionItem;
      expect(transaction.id).toBe(txnId);
      expect(transaction).toHaveProperty("amount");
      expect(transaction).toHaveProperty("side");
      expect(transaction).toHaveProperty("status");
      expect(transaction).toHaveProperty("currency");
    });
  });
});
