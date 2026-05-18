// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { resolve } from "node:path";
import { AttachmentSchema, UploadedAttachmentSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import {
  cli,
  cliJson,
  type LifecycleSkipCarrier,
  assertLifecycleState,
  skipIfUpstreamSkipped,
  skipMissingFixture,
} from "../helpers.js";
import { hasApiKeyCredentials } from "../sandbox.js";

interface TransactionItem {
  readonly id: string;
  readonly attachment_ids?: readonly string[];
}

interface AttachmentItem {
  readonly id: string;
  readonly file_name: string;
  readonly file_size: string;
  readonly file_content_type: string;
  readonly url: string;
  readonly created_at: string;
}

interface UploadedAttachmentItem {
  readonly id: string;
}

/**
 * Absolute path to the committed PDF fixture used by the CRUD round-trip.
 * Computed via `import.meta.dirname` to be independent of process CWD.
 */
const PDF_FIXTURE_PATH = resolve(import.meta.dirname, "..", "..", "fixtures", "tiny.pdf");

/**
 * Find a transaction that has at least one attachment.
 */
function findTransactionWithAttachments(): TransactionItem | undefined {
  const transactions = cliJson<TransactionItem[]>(
    "transaction",
    "list",
    "--with-attachments",
    "--no-paginate",
    "--per-page",
    "1",
  );
  return transactions[0];
}

/**
 * Find a transaction with no existing attachments — gives the CRUD round-trip a
 * clean canvas so its eventual cleanup does not destroy unrelated test data.
 * Single-page fetch via `--no-paginate`; sandbox accounts have enough breadth
 * that one without attachments is essentially always among the first 50.
 */
function findTransactionWithoutAttachments(): TransactionItem | undefined {
  const transactions = cliJson<TransactionItem[]>("transaction", "list", "--no-paginate", "--per-page", "50");
  return transactions.find((t) => (t.attachment_ids?.length ?? 0) === 0);
}

describe.skipIf(!hasApiKeyCredentials())("attachment CLI commands (e2e)", () => {
  describe("transaction attachment list", () => {
    it("lists attachments for a transaction and validates through schema", (ctx) => {
      const txn = findTransactionWithAttachments();
      if (txn === undefined) {
        skipMissingFixture(ctx, "no transactions with attachments in sandbox");
      }

      const attachments = cliJson<AttachmentItem[]>("transaction", "attachment", "list", txn.id);
      expect(Array.isArray(attachments)).toBe(true);
      expect(attachments.length).toBeGreaterThan(0);

      for (const attachment of attachments) {
        AttachmentSchema.parse(attachment);
        expect(attachment).toHaveProperty("id");
        expect(attachment).toHaveProperty("file_name");
        expect(attachment).toHaveProperty("file_size");
        expect(attachment).toHaveProperty("file_content_type");
        expect(attachment).toHaveProperty("url");
        expect(attachment).toHaveProperty("created_at");
      }
    });
  });

  describe("attachment show", () => {
    it("shows attachment details by ID and validates through schema", (ctx) => {
      const txn = findTransactionWithAttachments();
      if (txn === undefined) {
        skipMissingFixture(ctx, "no transactions with attachments in sandbox");
      }

      const attachments = cliJson<AttachmentItem[]>("transaction", "attachment", "list", txn.id);
      expect(attachments.length).toBeGreaterThan(0);

      const attachmentId = (attachments[0] as AttachmentItem).id;
      const attachment = cliJson<AttachmentItem>("attachment", "show", attachmentId);
      AttachmentSchema.parse(attachment);
      expect(attachment.id).toBe(attachmentId);
      expect(attachment).toHaveProperty("file_name");
      expect(attachment).toHaveProperty("file_size");
      expect(attachment).toHaveProperty("file_content_type");
      expect(attachment).toHaveProperty("url");
      expect(attachment).toHaveProperty("created_at");
    });
  });

  // Real upload + delete round-trip against the live sandbox — closes the audit
  // gap from umbrella #449 (Group 4a): attachment write paths were fully
  // implemented but entirely uncovered by E2E. Sequential `it` blocks share
  // `transactionId` / `addedAttachmentId` via closure, mirroring the pattern in
  // `packages/e2e/src/webhooks/cli.e2e.test.ts`. CLI's `transaction attachment
  // remove <txId>` (without an attachment-id) is interactive — covering
  // `removeAllTransactionAttachments` is intentionally left to the MCP suite,
  // which has no such prompt and exercises the same core function.
  describe("attachment upload + delete round-trip", () => {
    const lifecycleSkip: LifecycleSkipCarrier = { reason: undefined };
    let transactionId: string | undefined;
    let addedAttachmentId: string | undefined;

    it("uploads a standalone attachment via attachment upload", () => {
      // `POST /v2/attachments` returns ONLY the attachment ID — the Qonto API
      // does not echo `file_name`, `file_content_type`, etc. on this endpoint.
      // Asserting against `UploadedAttachmentSchema` (rather than the full
      // `AttachmentSchema`) is how the test pins that contract.
      const attachment = cliJson<UploadedAttachmentItem>("attachment", "upload", PDF_FIXTURE_PATH);
      UploadedAttachmentSchema.parse(attachment);
      expect(attachment.id).toBeDefined();
      expect(typeof attachment.id).toBe("string");
    });

    it("adds the fixture to a transaction via transaction attachment add", (ctx) => {
      const txn = findTransactionWithoutAttachments();
      if (txn === undefined) {
        skipMissingFixture(ctx, "no attachment-free transaction in sandbox for CRUD round-trip", lifecycleSkip);
      }
      transactionId = txn.id;

      // The CLI prints the response to stdout when the API returns the attachment
      // and to stderr when it does not (see `transaction/attachment.ts` action).
      // To avoid coupling the test to which branch fires, infer the new ID by
      // listing afterward and picking the most-recently-created entry.
      cli("transaction", "attachment", "add", transactionId, PDF_FIXTURE_PATH);

      const attachments = cliJson<AttachmentItem[]>("transaction", "attachment", "list", transactionId);
      expect(attachments.length).toBeGreaterThan(0);
      const newest = [...attachments].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] as AttachmentItem;
      expect(newest.file_name).toBe("tiny.pdf");
      addedAttachmentId = newest.id;
    });

    it("listTransactionAttachments returns the added attachment", (ctx) => {
      skipIfUpstreamSkipped(lifecycleSkip, ctx);
      const txnId = assertLifecycleState(transactionId, "transactionId");
      const attId = assertLifecycleState(addedAttachmentId, "addedAttachmentId");

      const attachments = cliJson<AttachmentItem[]>("transaction", "attachment", "list", txnId);
      expect(attachments.map((a) => a.id)).toContain(attId);
    });

    it("removes the attachment via transaction attachment remove", (ctx) => {
      skipIfUpstreamSkipped(lifecycleSkip, ctx);
      const txnId = assertLifecycleState(transactionId, "transactionId");
      const attId = assertLifecycleState(addedAttachmentId, "addedAttachmentId");

      cli("transaction", "attachment", "remove", txnId, attId);

      const attachments = cliJson<AttachmentItem[]>("transaction", "attachment", "list", txnId);
      expect(attachments.map((a) => a.id)).not.toContain(attId);
    });
  });
});
