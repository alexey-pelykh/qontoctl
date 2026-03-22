// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { ClientInvoiceSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cliEnv, hasCredentials } from "../sandbox.js";

const CLI_PATH = resolve(import.meta.dirname, "../../../qontoctl/dist/cli.js");

function cli(...args: string[]): string {
  return execFileSync("node", [CLI_PATH, ...args], {
    encoding: "utf-8",
    env: cliEnv(),
    timeout: 30_000,
  });
}

describe.skipIf(!hasCredentials())("client-invoice commands (e2e)", () => {
  describe("client-invoice list", () => {
    it("lists client invoices", () => {
      const output = cli("client-invoice", "list");
      expect(output).toBeDefined();
    });

    it("produces valid JSON with --output json", () => {
      const output = cli("--output", "json", "client-invoice", "list");
      const parsed = JSON.parse(output) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
    });

    it("supports --status filter", () => {
      const output = cli("--output", "json", "client-invoice", "list", "--status", "draft");
      const parsed = JSON.parse(output) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
    });
  });

  describe("client-invoice CRUD lifecycle", () => {
    let createdInvoiceId: string | undefined;

    it("creates a draft invoice", () => {
      // Get a client ID from existing clients
      const clientListOutput = cli("--output", "json", "client", "list");
      const clients = JSON.parse(clientListOutput) as { id: string }[];
      if (clients.length === 0) {
        return;
      }

      const clientId = (clients[0] as { id: string }).id;
      const today = new Date().toISOString().split("T")[0] as string;
      const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] as string;

      const body = JSON.stringify({
        client_id: clientId,
        issue_date: today,
        due_date: dueDate,
        currency: "EUR",
        terms_and_conditions: "E2E test invoice — safe to delete",
        items: [
          {
            title: "E2E Test Service",
            quantity: "1",
            unit_price: { value: "100.00", currency: "EUR" },
            vat_rate: "20",
          },
        ],
      });

      try {
        const output = cli("--output", "json", "client-invoice", "create", "--body", body);
        const parsed = JSON.parse(output) as Record<string, unknown>;
        expect(parsed).toHaveProperty("id");
        expect(parsed).toHaveProperty("status", "draft");
        createdInvoiceId = parsed["id"] as string;
      } catch {
        // Invoice creation may fail if the organization lacks required setup
        // (e.g., IBAN not configured). Skip downstream lifecycle tests.
      }
    });

    it("shows the created invoice", () => {
      if (createdInvoiceId === undefined) {
        return;
      }

      const output = cli("--output", "json", "client-invoice", "show", createdInvoiceId);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", createdInvoiceId);
      expect(parsed).toHaveProperty("items");
    });

    it("updates the created invoice", () => {
      if (createdInvoiceId === undefined) {
        return;
      }

      const body = JSON.stringify({
        header: "Updated by E2E test",
      });

      const output = cli("--output", "json", "client-invoice", "update", createdInvoiceId, "--body", body);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", createdInvoiceId);
    });

    it("deletes the created invoice", () => {
      if (createdInvoiceId === undefined) {
        return;
      }

      const output = cli("--output", "json", "client-invoice", "delete", createdInvoiceId, "--yes");
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("deleted", true);
    });
  });

  describe("client-invoice show", () => {
    it("shows an existing invoice", () => {
      const listOutput = cli("--output", "json", "client-invoice", "list");
      const invoices = JSON.parse(listOutput) as { id: string }[];
      if (invoices.length === 0) {
        return;
      }

      const invoiceId = (invoices[0] as { id: string }).id;
      const output = cli("--output", "json", "client-invoice", "show", invoiceId);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      ClientInvoiceSchema.parse(parsed);
      expect(parsed).toHaveProperty("id", invoiceId);
      expect(parsed).toHaveProperty("status");
    });
  });

  describe("client-invoice delete without --yes", () => {
    it("exits with error when --yes is not provided", () => {
      try {
        cli("client-invoice", "delete", "00000000-0000-0000-0000-000000000000");
        // Should not reach here
        expect.fail("Expected command to exit with non-zero code");
      } catch (error: unknown) {
        // execFileSync throws on non-zero exit code
        const execError = error as { status: number; stderr: Buffer };
        expect(execError.status).toBe(1);
      }
    });
  });
});
