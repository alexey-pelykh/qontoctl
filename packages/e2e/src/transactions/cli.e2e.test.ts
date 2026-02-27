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

interface TransactionItem {
  readonly id: string;
  readonly amount: number;
  readonly side: "credit" | "debit";
  readonly status: "pending" | "declined" | "completed";
  readonly currency: string;
  readonly operation_type: string;
  readonly label: string;
  readonly settled_at: string | null;
  readonly bank_account_id: string;
  readonly attachment_ids?: readonly string[];
  readonly labels?: readonly { id: string; name: string }[];
  readonly attachments?: readonly unknown[];
}

/**
 * Get the first transaction from a list, or undefined if empty.
 * Helper to avoid non-null assertions in tests.
 */
function firstTransaction(transactions: readonly TransactionItem[]): TransactionItem | undefined {
  return transactions[0];
}

describe.skipIf(!hasCredentials())("transaction CLI commands (e2e)", () => {
  describe("transaction list", () => {
    it("lists transactions with default output", () => {
      const output = cli("transaction", "list", "--no-paginate");
      expect(output.length).toBeGreaterThan(0);
    });

    it("lists transactions as JSON", () => {
      const transactions = cliJson<TransactionItem[]>("transaction", "list", "--no-paginate");
      expect(Array.isArray(transactions)).toBe(true);
      const txn = firstTransaction(transactions);
      if (txn !== undefined) {
        expect(txn).toHaveProperty("id");
        expect(txn).toHaveProperty("amount");
        expect(txn).toHaveProperty("side");
        expect(txn).toHaveProperty("status");
        expect(txn).toHaveProperty("currency");
      }
    });

    it("lists transactions with pagination", () => {
      const transactions = cliJson<TransactionItem[]>("transaction", "list", "--per-page", "2", "--page", "1");
      expect(Array.isArray(transactions)).toBe(true);
      expect(transactions.length).toBeLessThanOrEqual(2);
    });

    it("filters by bank account ID", () => {
      const all = cliJson<TransactionItem[]>("transaction", "list", "--no-paginate", "--per-page", "1");
      const first = firstTransaction(all);
      if (first === undefined) return;

      const bankAccountId = first.bank_account_id;
      const filtered = cliJson<TransactionItem[]>(
        "transaction",
        "list",
        "--bank-account",
        bankAccountId,
        "--no-paginate",
      );
      expect(Array.isArray(filtered)).toBe(true);
      for (const txn of filtered) {
        expect(txn.bank_account_id).toBe(bankAccountId);
      }
    });

    it("filters by status", () => {
      const transactions = cliJson<TransactionItem[]>("transaction", "list", "--status", "completed", "--no-paginate");
      expect(Array.isArray(transactions)).toBe(true);
      for (const txn of transactions) {
        expect(txn.status).toBe("completed");
      }
    });

    it("filters by side", () => {
      const transactions = cliJson<TransactionItem[]>("transaction", "list", "--side", "debit", "--no-paginate");
      expect(Array.isArray(transactions)).toBe(true);
      for (const txn of transactions) {
        expect(txn.side).toBe("debit");
      }
    });

    it("filters by date range", () => {
      const fromDate = "2020-01-01";
      const toDate = "2026-12-31";
      const transactions = cliJson<TransactionItem[]>(
        "transaction",
        "list",
        "--status",
        "completed",
        "--from",
        fromDate,
        "--to",
        toDate,
        "--no-paginate",
      );
      expect(Array.isArray(transactions)).toBe(true);
      for (const txn of transactions) {
        if (txn.settled_at !== null) {
          expect(txn.settled_at >= fromDate).toBe(true);
          expect(txn.settled_at <= `${toDate}T23:59:59`).toBe(true);
        }
      }
    });

    it("includes labels with --include labels", () => {
      const transactions = cliJson<TransactionItem[]>(
        "transaction",
        "list",
        "--include",
        "labels",
        "--no-paginate",
        "--per-page",
        "5",
      );
      expect(Array.isArray(transactions)).toBe(true);
      for (const txn of transactions) {
        expect(txn).toHaveProperty("labels");
        expect(Array.isArray(txn.labels)).toBe(true);
      }
    });

    it("includes attachments with --include attachments", () => {
      const transactions = cliJson<TransactionItem[]>(
        "transaction",
        "list",
        "--include",
        "attachments",
        "--no-paginate",
        "--per-page",
        "5",
      );
      expect(Array.isArray(transactions)).toBe(true);
      for (const txn of transactions) {
        expect(txn).toHaveProperty("attachments");
        expect(Array.isArray(txn.attachments)).toBe(true);
      }
    });

    it("includes labels and attachments together", () => {
      const transactions = cliJson<TransactionItem[]>(
        "transaction",
        "list",
        "--include",
        "labels",
        "attachments",
        "--no-paginate",
        "--per-page",
        "5",
      );
      expect(Array.isArray(transactions)).toBe(true);
      for (const txn of transactions) {
        expect(txn).toHaveProperty("labels");
        expect(Array.isArray(txn.labels)).toBe(true);
        expect(txn).toHaveProperty("attachments");
        expect(Array.isArray(txn.attachments)).toBe(true);
      }
    });

    it("filters with --with-attachments", () => {
      const transactions = cliJson<TransactionItem[]>(
        "transaction",
        "list",
        "--with-attachments",
        "--include",
        "attachments",
        "--no-paginate",
      );
      expect(Array.isArray(transactions)).toBe(true);
      for (const txn of transactions) {
        expect(txn.attachment_ids?.length ?? 0).toBeGreaterThan(0);
      }
    });

    it("outputs CSV format", () => {
      const output = cli("transaction", "list", "--output", "csv", "--no-paginate", "--per-page", "5");
      const lines = output.trim().split("\n");
      expect(lines.length).toBeGreaterThanOrEqual(1);
      const header = lines[0] ?? "";
      expect(header).toContain("id");
      expect(header).toContain("amount");
      expect(header).toContain("side");
      expect(header).toContain("status");
    });

    it("outputs YAML format", () => {
      const output = cli("transaction", "list", "--output", "yaml", "--no-paginate", "--per-page", "2");
      expect(output).toContain("id:");
    });

    it("outputs table format", () => {
      const output = cli("transaction", "list", "--output", "table", "--no-paginate", "--per-page", "2");
      expect(output.length).toBeGreaterThan(0);
    });
  });

  describe("transaction show", () => {
    it("shows a transaction by ID", () => {
      const transactions = cliJson<TransactionItem[]>("transaction", "list", "--no-paginate", "--per-page", "1");
      const first = firstTransaction(transactions);
      if (first === undefined) return;

      const txnId = first.id;
      const transaction = cliJson<TransactionItem>("transaction", "show", txnId);
      expect(transaction.id).toBe(txnId);
      expect(transaction).toHaveProperty("amount");
      expect(transaction).toHaveProperty("side");
      expect(transaction).toHaveProperty("status");
      expect(transaction).toHaveProperty("currency");
    });

    it("shows a transaction with included labels", () => {
      const transactions = cliJson<TransactionItem[]>("transaction", "list", "--no-paginate", "--per-page", "1");
      const first = firstTransaction(transactions);
      if (first === undefined) return;

      const txnId = first.id;
      const transaction = cliJson<TransactionItem>("transaction", "show", txnId, "--include", "labels");
      expect(transaction.id).toBe(txnId);
      expect(transaction).toHaveProperty("labels");
      expect(Array.isArray(transaction.labels)).toBe(true);
    });

    it("shows a transaction with included attachments", () => {
      const transactions = cliJson<TransactionItem[]>("transaction", "list", "--no-paginate", "--per-page", "1");
      const first = firstTransaction(transactions);
      if (first === undefined) return;

      const txnId = first.id;
      const transaction = cliJson<TransactionItem>("transaction", "show", txnId, "--include", "attachments");
      expect(transaction.id).toBe(txnId);
      expect(transaction).toHaveProperty("attachments");
    });

    it("outputs transaction details as YAML", () => {
      const transactions = cliJson<TransactionItem[]>("transaction", "list", "--no-paginate", "--per-page", "1");
      const first = firstTransaction(transactions);
      if (first === undefined) return;

      const txnId = first.id;
      const output = cli("transaction", "show", txnId, "--output", "yaml");
      expect(output).toContain("id:");
      expect(output).toContain(txnId);
    });
  });
});
