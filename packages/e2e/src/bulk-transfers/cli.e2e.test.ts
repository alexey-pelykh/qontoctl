// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { BulkTransferSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cliCwd, cliEnv, hasCredentials } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

function cli(...args: string[]): string {
  return execFileSync("node", [CLI_PATH, ...args], {
    encoding: "utf-8",
    env: cliEnv(),
    cwd: cliCwd(),
  });
}

function cliJson<T>(...args: string[]): T {
  const output = cli(...args, "--output", "json");
  return JSON.parse(output) as T;
}

interface BulkTransferItem {
  readonly id: string;
  readonly initiator_id: string;
  readonly total_count: number;
  readonly completed_count: number;
  readonly pending_count: number;
  readonly failed_count: number;
  readonly created_at: string;
  readonly updated_at: string;
}

describe.skipIf(!hasCredentials())("bulk-transfer CLI commands (e2e)", () => {
  describe("bulk-transfer list", () => {
    it("lists bulk transfers with default output", () => {
      const output = cli("bulk-transfer", "list", "--no-paginate");
      expect(output).toBeDefined();
    });

    it("produces valid JSON with --output json", () => {
      const bulkTransfers = cliJson<BulkTransferItem[]>("bulk-transfer", "list", "--no-paginate");
      expect(Array.isArray(bulkTransfers)).toBe(true);
      for (const item of bulkTransfers) {
        expect(item).toHaveProperty("id");
        expect(item).toHaveProperty("total_count");
        expect(item).toHaveProperty("completed_count");
        expect(item).toHaveProperty("created_at");
      }
    });

    it("lists bulk transfers with pagination", () => {
      const bulkTransfers = cliJson<BulkTransferItem[]>("bulk-transfer", "list", "--per-page", "2", "--page", "1");
      expect(Array.isArray(bulkTransfers)).toBe(true);
      expect(bulkTransfers.length).toBeLessThanOrEqual(2);
    });
  });

  describe("bulk-transfer create", () => {
    it("creates a bulk transfer from a JSON file", () => {
      const beneficiaries = cliJson<{ id: string }[]>("beneficiary", "list", "--no-paginate", "--per-page", "1");
      if (beneficiaries.length === 0) return;

      const beneficiaryId = (beneficiaries[0] as { id: string }).id;

      const tmpDir = mkdtempSync(join(tmpdir(), "qontoctl-e2e-"));
      const filePath = join(tmpDir, "transfers.json");
      writeFileSync(
        filePath,
        JSON.stringify([{ beneficiary_id: beneficiaryId, amount: 1.0, currency: "EUR", reference: "e2e-bulk-test" }]),
      );

      try {
        const bt = cliJson<BulkTransferItem>("bulk-transfer", "create", "--file", filePath);
        BulkTransferSchema.parse(bt);
        expect(bt).toHaveProperty("id");
        expect(bt).toHaveProperty("total_count");
        expect(bt.total_count).toBe(1);
      } finally {
        rmSync(tmpDir, { recursive: true });
      }
    });
  });

  describe("bulk-transfer show", () => {
    it("shows a bulk transfer by ID", () => {
      const bulkTransfers = cliJson<BulkTransferItem[]>("bulk-transfer", "list", "--no-paginate");
      if (bulkTransfers.length === 0) return;

      const first = bulkTransfers[0] as BulkTransferItem;

      const bt = cliJson<BulkTransferItem>("bulk-transfer", "show", first.id);
      BulkTransferSchema.parse(bt);
      expect(bt.id).toBe(first.id);
      expect(bt).toHaveProperty("total_count");
      expect(bt).toHaveProperty("completed_count");
      expect(bt).toHaveProperty("pending_count");
      expect(bt).toHaveProperty("failed_count");
    });
  });
});
