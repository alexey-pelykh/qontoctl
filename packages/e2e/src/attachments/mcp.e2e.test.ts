// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { AttachmentSchema, UploadedAttachmentSchema } from "@qontoctl/core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CLI_PATH,
  firstTextFromMcpResult,
  type LifecycleSkipCarrier,
  assertLifecycleState,
  skipIfUpstreamSkipped,
  skipMissingFixture,
} from "../helpers.js";
import { cliEnv, hasApiKeyCredentials } from "../sandbox.js";

/**
 * Absolute path to the committed PDF fixture used by the CRUD round-trip.
 * Computed via `import.meta.dirname` to be independent of process CWD.
 */
const PDF_FIXTURE_PATH = resolve(import.meta.dirname, "..", "..", "fixtures", "tiny.pdf");

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

describe.skipIf(!hasApiKeyCredentials())("attachment MCP tools (e2e)", () => {
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

  /**
   * Find a transaction with attachments via the MCP transaction_list tool.
   */
  async function findTransactionWithAttachments(): Promise<TransactionItem | undefined> {
    const result = await client.callTool({
      name: "transaction_list",
      arguments: { with_attachments: true, per_page: 5 },
    });

    const parsed = JSON.parse(firstTextFromMcpResult(result)) as TransactionListResponse;

    return parsed.transactions.find((txn) => txn.attachment_ids !== undefined && txn.attachment_ids.length > 0);
  }

  describe("transaction_attachment_list", () => {
    it("lists attachments for a transaction and validates through schema", async (ctx) => {
      const txn = await findTransactionWithAttachments();
      if (txn === undefined) {
        skipMissingFixture(ctx, "no transactions with attachments in sandbox");
      }

      const result = await client.callTool({
        name: "transaction_attachment_list",
        arguments: { transaction_id: txn.id },
      });

      expect(result.isError).not.toBe(true);

      const parsed = JSON.parse(firstTextFromMcpResult(result)) as AttachmentListResponse;
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
    it("shows attachment details by ID and validates through schema", async (ctx) => {
      const txn = await findTransactionWithAttachments();
      if (txn === undefined) {
        skipMissingFixture(ctx, "no transactions with attachments in sandbox");
      }

      // First get the attachment list to find a valid ID
      const listResult = await client.callTool({
        name: "transaction_attachment_list",
        arguments: { transaction_id: txn.id },
      });

      const listParsed = JSON.parse(firstTextFromMcpResult(listResult)) as AttachmentListResponse;
      expect(listParsed.attachments.length).toBeGreaterThan(0);

      const attachmentId = (listParsed.attachments[0] as AttachmentItem).id;

      // Now show that specific attachment
      const showResult = await client.callTool({
        name: "attachment_show",
        arguments: { id: attachmentId },
      });

      expect(showResult.isError).not.toBe(true);

      const showParsed = JSON.parse(firstTextFromMcpResult(showResult)) as AttachmentItem;
      AttachmentSchema.parse(showParsed);
      expect(showParsed.id).toBe(attachmentId);
      expect(showParsed).toHaveProperty("file_name");
      expect(showParsed).toHaveProperty("file_size");
      expect(showParsed).toHaveProperty("file_content_type");
      expect(showParsed).toHaveProperty("url");
      expect(showParsed).toHaveProperty("created_at");
    });
  });

  // Find a transaction with no existing attachments so the round-trip's eventual
  // `removeAllTransactionAttachments` cleanup does not destroy unrelated test
  // data. Searches the first 50 transactions; sandbox accounts have enough
  // breadth that one without attachments is essentially always available.
  async function findTransactionWithoutAttachments(): Promise<TransactionItem | undefined> {
    const result = await client.callTool({
      name: "transaction_list",
      arguments: { per_page: 50 },
    });

    const parsed = JSON.parse(firstTextFromMcpResult(result)) as TransactionListResponse;

    return parsed.transactions.find((txn) => (txn.attachment_ids?.length ?? 0) === 0);
  }

  // Real upload + delete round-trip against the live sandbox — closes the audit
  // gap from umbrella #449 (Group 4a): attachment write paths were fully
  // implemented but entirely uncovered by E2E. Sequential `it` blocks share
  // `transactionId` / `addedAttachmentId` via closure, mirroring the pattern in
  // `packages/e2e/src/webhooks/mcp.e2e.test.ts`. Covers
  // `removeAllTransactionAttachments` as well — the MCP tool has no interactive
  // prompt, whereas the CLI's all-remove variant does (see cli.e2e.test.ts
  // comment); this is the canonical site for that function's coverage.
  describe("attachment upload + delete round-trip (MCP)", () => {
    const lifecycleSkip: LifecycleSkipCarrier = { reason: undefined };
    let transactionId: string | undefined;
    let addedAttachmentId: string | undefined;

    it("uploads a standalone attachment via attachment_upload", async () => {
      const result = await client.callTool({
        name: "attachment_upload",
        arguments: { file_path: PDF_FIXTURE_PATH },
      });

      expect(result.isError).toBeFalsy();
      // `POST /v2/attachments` returns ONLY the attachment ID — see the parallel
      // CLI test for the contract rationale. `UploadedAttachmentSchema` pins
      // that shape.
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as { id: string };
      UploadedAttachmentSchema.parse(parsed);
      expect(parsed.id).toBeDefined();
      expect(typeof parsed.id).toBe("string");
    });

    it("adds the fixture to a transaction via transaction_attachment_add", async (ctx) => {
      const txn = await findTransactionWithoutAttachments();
      if (txn === undefined) {
        skipMissingFixture(ctx, "no attachment-free transaction in sandbox for CRUD round-trip", lifecycleSkip);
      }
      transactionId = txn.id;

      const addResult = await client.callTool({
        name: "transaction_attachment_add",
        arguments: { transaction_id: transactionId, file_path: PDF_FIXTURE_PATH },
      });
      expect(addResult.isError).toBeFalsy();

      // The API may return the attachment in the body or omit it (see
      // `addTransactionAttachment` in core); infer the new ID by listing.
      const listResult = await client.callTool({
        name: "transaction_attachment_list",
        arguments: { transaction_id: transactionId },
      });
      const listParsed = JSON.parse(firstTextFromMcpResult(listResult)) as AttachmentListResponse;
      expect(listParsed.attachments.length).toBeGreaterThan(0);
      const newest = [...listParsed.attachments].sort((a, b) =>
        b.created_at.localeCompare(a.created_at),
      )[0] as AttachmentItem;
      expect(newest.file_name).toBe("tiny.pdf");
      addedAttachmentId = newest.id;
    });

    it("transaction_attachment_list returns the added attachment", async (ctx) => {
      skipIfUpstreamSkipped(lifecycleSkip, ctx);
      const txnId = assertLifecycleState(transactionId, "transactionId");
      const attId = assertLifecycleState(addedAttachmentId, "addedAttachmentId");

      const result = await client.callTool({
        name: "transaction_attachment_list",
        arguments: { transaction_id: txnId },
      });
      const parsed = JSON.parse(firstTextFromMcpResult(result)) as AttachmentListResponse;
      expect(parsed.attachments.map((a) => a.id)).toContain(attId);
    });

    it("removes the specific attachment via transaction_attachment_remove", async (ctx) => {
      skipIfUpstreamSkipped(lifecycleSkip, ctx);
      const txnId = assertLifecycleState(transactionId, "transactionId");
      const attId = assertLifecycleState(addedAttachmentId, "addedAttachmentId");

      const removeResult = await client.callTool({
        name: "transaction_attachment_remove",
        arguments: { transaction_id: txnId, attachment_id: attId },
      });
      expect(removeResult.isError).toBeFalsy();

      const listResult = await client.callTool({
        name: "transaction_attachment_list",
        arguments: { transaction_id: txnId },
      });
      const parsed = JSON.parse(firstTextFromMcpResult(listResult)) as AttachmentListResponse;
      expect(parsed.attachments.map((a) => a.id)).not.toContain(attId);
    });

    it("removes all attachments via transaction_attachment_remove (cleanup + coverage)", async (ctx) => {
      skipIfUpstreamSkipped(lifecycleSkip, ctx);
      const txnId = assertLifecycleState(transactionId, "transactionId");

      // Re-seed an attachment so `removeAllTransactionAttachments` has something
      // to remove — this doubles as the function's own coverage point per AC.
      const addResult = await client.callTool({
        name: "transaction_attachment_add",
        arguments: { transaction_id: txnId, file_path: PDF_FIXTURE_PATH },
      });
      expect(addResult.isError).toBeFalsy();

      const beforeResult = await client.callTool({
        name: "transaction_attachment_list",
        arguments: { transaction_id: txnId },
      });
      const before = JSON.parse(firstTextFromMcpResult(beforeResult)) as AttachmentListResponse;
      expect(before.attachments.length).toBeGreaterThan(0);

      const removeAllResult = await client.callTool({
        name: "transaction_attachment_remove",
        arguments: { transaction_id: txnId },
      });
      expect(removeAllResult.isError).toBeFalsy();

      const afterResult = await client.callTool({
        name: "transaction_attachment_list",
        arguments: { transaction_id: txnId },
      });
      const after = JSON.parse(firstTextFromMcpResult(afterResult)) as AttachmentListResponse;
      expect(after.attachments.length).toBe(0);
    });
  });
});
