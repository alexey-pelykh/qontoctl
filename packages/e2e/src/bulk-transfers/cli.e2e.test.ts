// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
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
