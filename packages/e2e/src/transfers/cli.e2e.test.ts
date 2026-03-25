// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { TransferSchema } from "@qontoctl/core";
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

interface TransferItem {
  readonly id: string;
  readonly beneficiary_id: string;
  readonly amount: number;
  readonly amount_cents: number;
  readonly amount_currency: string;
  readonly status: "pending" | "processing" | "canceled" | "declined" | "settled";
  readonly reference: string;
  readonly note: string | null;
  readonly scheduled_date: string;
  readonly bank_account_id: string;
}

function firstTransfer(transfers: readonly TransferItem[]): TransferItem | undefined {
  return transfers[0];
}

describe.skipIf(!hasCredentials())("transfer CLI commands (e2e)", () => {
  describe("transfer list", () => {
    it("lists transfers with default output", () => {
      const output = cli("transfer", "list", "--no-paginate");
      expect(output.length).toBeGreaterThan(0);
    });

    it("lists transfers as JSON", () => {
      const transfers = cliJson<TransferItem[]>("transfer", "list", "--no-paginate");
      expect(Array.isArray(transfers)).toBe(true);
      const t = firstTransfer(transfers);
      if (t !== undefined) {
        TransferSchema.parse(t);
        expect(t).toHaveProperty("id");
        expect(t).toHaveProperty("amount");
        expect(t).toHaveProperty("beneficiary_id");
        expect(t).toHaveProperty("status");
        expect(t).toHaveProperty("amount_currency");
      }
    });

    it("lists transfers with pagination", () => {
      const transfers = cliJson<TransferItem[]>("transfer", "list", "--per-page", "2", "--page", "1");
      expect(Array.isArray(transfers)).toBe(true);
      expect(transfers.length).toBeLessThanOrEqual(2);
    });

    it("filters by status", () => {
      const transfers = cliJson<TransferItem[]>("transfer", "list", "--status", "settled", "--no-paginate");
      expect(Array.isArray(transfers)).toBe(true);
      for (const t of transfers) {
        expect(t.status).toBe("settled");
      }
    });

    it("outputs CSV format", () => {
      const output = cli("transfer", "list", "--output", "csv", "--no-paginate", "--per-page", "5");
      const lines = output.trim().split("\n");
      expect(lines.length).toBeGreaterThanOrEqual(1);
      const header = lines[0] ?? "";
      expect(header).toContain("id");
      expect(header).toContain("amount");
      expect(header).toContain("status");
    });

    it("outputs YAML format", () => {
      const output = cli("transfer", "list", "--output", "yaml", "--no-paginate", "--per-page", "2");
      expect(output).toContain("id:");
    });

    it("outputs table format", () => {
      const output = cli("transfer", "list", "--output", "table", "--no-paginate", "--per-page", "2");
      expect(output.length).toBeGreaterThan(0);
    });
  });

  describe("transfer show", () => {
    it("shows a transfer by ID", () => {
      const transfers = cliJson<TransferItem[]>("transfer", "list", "--no-paginate", "--per-page", "1");
      const first = firstTransfer(transfers);
      if (first === undefined) return;

      const transferId = first.id;
      const transfer = cliJson<TransferItem>("transfer", "show", transferId);
      TransferSchema.parse(transfer);
      expect(transfer.id).toBe(transferId);
      expect(transfer).toHaveProperty("amount");
      expect(transfer).toHaveProperty("beneficiary_id");
      expect(transfer).toHaveProperty("status");
      expect(transfer).toHaveProperty("amount_currency");
    });

    it("outputs transfer details as YAML", () => {
      const transfers = cliJson<TransferItem[]>("transfer", "list", "--no-paginate", "--per-page", "1");
      const first = firstTransfer(transfers);
      if (first === undefined) return;

      const transferId = first.id;
      const output = cli("transfer", "show", transferId, "--output", "yaml");
      expect(output).toContain("id:");
      expect(output).toContain(transferId);
    });
  });
});
