// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { AttachmentSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cliEnv, hasCredentials } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

function cli(...args: string[]): string {
  return execFileSync("node", [CLI_PATH, ...args], {
    encoding: "utf-8",
    env: cliEnv(),
  });
}

function cliJson<T>(...args: string[]): T {
  const output = cli(...args, "--output", "json");
  return JSON.parse(output) as T;
}

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

describe.skipIf(!hasCredentials())("attachment CLI commands (e2e)", () => {
  describe("transaction attachment list", () => {
    it("lists attachments for a transaction and validates through schema", () => {
      const txn = findTransactionWithAttachments();
      if (txn === undefined) return;

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
    it("shows attachment details by ID and validates through schema", () => {
      const txn = findTransactionWithAttachments();
      if (txn === undefined) return;

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
});
