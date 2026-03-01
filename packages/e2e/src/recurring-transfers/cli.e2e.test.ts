// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
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

interface RecurringTransferItem {
  readonly id: string;
  readonly initiator_id: string;
  readonly bank_account_id: string;
  readonly amount: number;
  readonly amount_cents: number;
  readonly amount_currency: string;
  readonly beneficiary_id: string;
  readonly frequency: string;
  readonly next_execution_date: string;
  readonly status: string;
}

describe.skipIf(!hasCredentials())("recurring-transfer CLI commands (e2e)", () => {
  describe("recurring-transfer list", () => {
    it("lists recurring transfers with default output", () => {
      const output = cli("recurring-transfer", "list", "--no-paginate");
      expect(output).toBeDefined();
    });

    it("produces valid JSON with --output json", () => {
      const recurringTransfers = cliJson<RecurringTransferItem[]>(
        "recurring-transfer",
        "list",
        "--no-paginate",
      );
      expect(Array.isArray(recurringTransfers)).toBe(true);
      for (const item of recurringTransfers) {
        expect(item).toHaveProperty("id");
        expect(item).toHaveProperty("amount");
        expect(item).toHaveProperty("frequency");
        expect(item).toHaveProperty("status");
      }
    });

    it("lists recurring transfers with pagination", () => {
      const recurringTransfers = cliJson<RecurringTransferItem[]>(
        "recurring-transfer",
        "list",
        "--per-page",
        "2",
        "--page",
        "1",
      );
      expect(Array.isArray(recurringTransfers)).toBe(true);
      expect(recurringTransfers.length).toBeLessThanOrEqual(2);
    });
  });

  describe("recurring-transfer show", () => {
    it("shows a recurring transfer by ID", () => {
      const recurringTransfers = cliJson<RecurringTransferItem[]>(
        "recurring-transfer",
        "list",
        "--no-paginate",
        "--per-page",
        "1",
      );
      const first = recurringTransfers[0];
      if (first === undefined) return;

      const rt = cliJson<RecurringTransferItem>("recurring-transfer", "show", first.id);
      expect(rt.id).toBe(first.id);
      expect(rt).toHaveProperty("amount");
      expect(rt).toHaveProperty("frequency");
      expect(rt).toHaveProperty("next_execution_date");
      expect(rt).toHaveProperty("status");
    });
  });
});
