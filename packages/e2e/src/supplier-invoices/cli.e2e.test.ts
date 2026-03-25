// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { SupplierInvoiceSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cliCwd, cliEnv, hasCredentials } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

function cli(...args: string[]): string {
  return execFileSync("node", [CLI_PATH, ...args], {
    encoding: "utf-8",
    env: cliEnv(),
    cwd: cliCwd(),
    timeout: 15_000,
  });
}

describe.skipIf(!hasCredentials())("supplier-invoice commands (e2e)", () => {
  describe("supplier-invoice list", () => {
    it("lists supplier invoices", () => {
      const output = cli("supplier-invoice", "list");
      expect(output).toBeDefined();
    });

    it("produces valid JSON with --output json", () => {
      const output = cli("--output", "json", "supplier-invoice", "list");
      const parsed = JSON.parse(output) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
      for (const item of parsed) {
        const invoice = item as Record<string, unknown>;
        expect(invoice).toHaveProperty("id");
        expect(invoice).toHaveProperty("status");
      }
    });

    it("supports --status filter", () => {
      const output = cli("--output", "json", "supplier-invoice", "list", "--status", "paid");
      const parsed = JSON.parse(output) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
    });
  });

  describe("supplier-invoice show", () => {
    it("shows supplier invoice details", () => {
      const listOutput = cli("--output", "json", "supplier-invoice", "list");
      const invoices = JSON.parse(listOutput) as { id: string }[];
      if (invoices.length === 0) {
        return; // No supplier invoices available
      }

      const firstInvoice = invoices[0];
      expect(firstInvoice).toBeDefined();
      const invoiceId = (firstInvoice as { id: string }).id;
      const output = cli("--output", "json", "supplier-invoice", "show", invoiceId);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      SupplierInvoiceSchema.parse(parsed);
      expect(parsed).toHaveProperty("id", invoiceId);
      expect(parsed).toHaveProperty("status");
    });
  });
});
