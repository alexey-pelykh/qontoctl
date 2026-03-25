// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { RecurringTransferListResponseSchema, RecurringTransferSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cliCwd, cliEnv, hasCredentials } from "../sandbox.js";

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
      cwd: cliCwd(),
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

  describe("recurring_transfer_create", () => {
    it("creates a recurring transfer", async () => {
      const beneficiaryResult = await client.callTool({
        name: "beneficiary_list",
        arguments: { per_page: 1 },
      });
      const beneficiaryText = beneficiaryResult.content[0] as { type: string; text: string };
      const beneficiaryParsed = JSON.parse(beneficiaryText.text) as {
        beneficiaries: { id: string }[];
      };
      if (beneficiaryParsed.beneficiaries.length === 0) return;
      const beneficiaryId = (beneficiaryParsed.beneficiaries[0] as { id: string }).id;

      const accountResult = await client.callTool({
        name: "account_list",
        arguments: {},
      });
      const accountText = accountResult.content[0] as { type: string; text: string };
      const accountParsed = JSON.parse(accountText.text) as { id: string }[];
      if (accountParsed.length === 0) return;
      const accountId = (accountParsed[0] as { id: string }).id;

      const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] as string;

      const result = await client.callTool({
        name: "recurring_transfer_create",
        arguments: {
          beneficiary_id: beneficiaryId,
          bank_account_id: accountId,
          amount: 1.0,
          currency: "EUR",
          reference: "e2e-mcp-recurring",
          first_execution_date: futureDate,
          frequency: "monthly",
        },
      });

      expect(result.isError).not.toBe(true);

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.type).toBe("text");

      const rt = JSON.parse(textContent.text) as RecurringTransferItem;
      RecurringTransferSchema.parse(rt);
      expect(rt).toHaveProperty("id");
      expect(rt.frequency).toBe("monthly");
      expect(rt).toHaveProperty("beneficiary_id", beneficiaryId);
    });
  });

  describe("recurring_transfer_cancel", () => {
    it("creates and then cancels a recurring transfer", async () => {
      const beneficiaryResult = await client.callTool({
        name: "beneficiary_list",
        arguments: { per_page: 1 },
      });
      const beneficiaryText = beneficiaryResult.content[0] as { type: string; text: string };
      const beneficiaryParsed = JSON.parse(beneficiaryText.text) as {
        beneficiaries: { id: string }[];
      };
      if (beneficiaryParsed.beneficiaries.length === 0) return;
      const beneficiaryId = (beneficiaryParsed.beneficiaries[0] as { id: string }).id;

      const accountResult = await client.callTool({
        name: "account_list",
        arguments: {},
      });
      const accountText = accountResult.content[0] as { type: string; text: string };
      const accountParsed = JSON.parse(accountText.text) as { id: string }[];
      if (accountParsed.length === 0) return;
      const accountId = (accountParsed[0] as { id: string }).id;

      const futureDate = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] as string;

      const createResult = await client.callTool({
        name: "recurring_transfer_create",
        arguments: {
          beneficiary_id: beneficiaryId,
          bank_account_id: accountId,
          amount: 1.0,
          currency: "EUR",
          reference: "e2e-mcp-cancel",
          first_execution_date: futureDate,
          frequency: "monthly",
        },
      });
      expect(createResult.isError).not.toBe(true);

      const createText = createResult.content[0] as { type: string; text: string };
      const created = JSON.parse(createText.text) as RecurringTransferItem;
      expect(created).toHaveProperty("id");

      const cancelResult = await client.callTool({
        name: "recurring_transfer_cancel",
        arguments: { id: created.id },
      });

      expect(cancelResult.isError).not.toBe(true);

      const cancelText = cancelResult.content[0] as { type: string; text: string };
      const canceled = JSON.parse(cancelText.text) as { canceled: boolean; id: string };
      expect(canceled.canceled).toBe(true);
      expect(canceled.id).toBe(created.id);
    });
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
        arguments: { per_page: 2, page: 1 },
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
