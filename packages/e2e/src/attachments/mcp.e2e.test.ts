// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { AttachmentSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cliCwd, cliEnv, hasCredentials } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

interface TransactionItem {
  readonly id: string;
  readonly attachment_ids?: readonly string[];
}

interface TransactionListResponse {
  readonly transactions: TransactionItem[];
  readonly meta: {
    readonly current_page: number;
    readonly total_pages: number;
    readonly total_count: number;
  };
}

interface AttachmentItem {
  readonly id: string;
  readonly file_name: string;
  readonly file_size: string;
  readonly file_content_type: string;
  readonly url: string;
  readonly created_at: string;
}

interface AttachmentListResponse {
  readonly attachments: AttachmentItem[];
}

describe.skipIf(!hasCredentials())("attachment MCP tools (e2e)", () => {
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

  /**
   * Find a transaction with attachments via the MCP transaction_list tool.
   */
  async function findTransactionWithAttachments(): Promise<TransactionItem | undefined> {
    const result = await client.callTool({
      name: "transaction_list",
      arguments: { with_attachments: true, per_page: 5 },
    });

    const textContent = result.content[0] as { type: string; text: string };
    const parsed = JSON.parse(textContent.text) as TransactionListResponse;

    return parsed.transactions.find((txn) => txn.attachment_ids !== undefined && txn.attachment_ids.length > 0);
  }

  describe("transaction_attachment_list", () => {
    it("lists attachments for a transaction and validates through schema", async () => {
      const txn = await findTransactionWithAttachments();
      if (txn === undefined) return;

      const result = await client.callTool({
        name: "transaction_attachment_list",
        arguments: { transaction_id: txn.id },
      });

      expect(result.isError).not.toBe(true);
      expect(result.content).toHaveLength(1);

      const textContent = result.content[0] as { type: string; text: string };
      expect(textContent.type).toBe("text");

      const parsed = JSON.parse(textContent.text) as AttachmentListResponse;
      expect(parsed).toHaveProperty("attachments");
      expect(Array.isArray(parsed.attachments)).toBe(true);
      expect(parsed.attachments.length).toBeGreaterThan(0);

      for (const attachment of parsed.attachments) {
        AttachmentSchema.parse(attachment);
        expect(attachment).toHaveProperty("id");
        expect(attachment).toHaveProperty("file_name");
        expect(attachment).toHaveProperty("file_size");
        expect(attachment).toHaveProperty("file_content_type");
      }
    });
  });

  describe("attachment_show", () => {
    it("shows attachment details by ID and validates through schema", async () => {
      const txn = await findTransactionWithAttachments();
      if (txn === undefined) return;

      // First get the attachment list to find a valid ID
      const listResult = await client.callTool({
        name: "transaction_attachment_list",
        arguments: { transaction_id: txn.id },
      });

      const listText = (listResult.content[0] as { type: string; text: string }).text;
      const listParsed = JSON.parse(listText) as AttachmentListResponse;
      expect(listParsed.attachments.length).toBeGreaterThan(0);

      const attachmentId = (listParsed.attachments[0] as AttachmentItem).id;

      // Now show that specific attachment
      const showResult = await client.callTool({
        name: "attachment_show",
        arguments: { id: attachmentId },
      });

      expect(showResult.isError).not.toBe(true);

      const showText = (showResult.content[0] as { type: string; text: string }).text;
      const showParsed = JSON.parse(showText) as AttachmentItem;
      AttachmentSchema.parse(showParsed);
      expect(showParsed.id).toBe(attachmentId);
      expect(showParsed).toHaveProperty("file_name");
      expect(showParsed).toHaveProperty("file_size");
      expect(showParsed).toHaveProperty("file_content_type");
      expect(showParsed).toHaveProperty("url");
      expect(showParsed).toHaveProperty("created_at");
    });
  });
});
