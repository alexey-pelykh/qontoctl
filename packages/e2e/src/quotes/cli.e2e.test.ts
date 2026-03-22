// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { QuoteSchema } from "@qontoctl/core";
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

describe.skipIf(!hasCredentials())("quote commands (e2e)", () => {
  describe("quote list", () => {
    it("lists quotes", () => {
      const output = cli("quote", "list");
      expect(output).toBeDefined();
    });

    it("produces valid JSON with --output json", () => {
      const output = cli("--output", "json", "quote", "list");
      const parsed = JSON.parse(output) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
    });

    it("supports --status filter", () => {
      const output = cli("--output", "json", "quote", "list", "--status", "pending_approval");
      const parsed = JSON.parse(output) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
    });
  });

  describe("quote CRUD lifecycle", () => {
    let createdQuoteId: string | undefined;

    it("creates a quote", () => {
      const today = new Date().toISOString().split("T")[0] as string;
      const expiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0] as string;

      // First get a client ID — list existing quotes to extract one
      const listOutput = cli("--output", "json", "quote", "list");
      const quotes = JSON.parse(listOutput) as { client: { id: string } }[];
      if (quotes.length === 0) {
        // Cannot test create without a known client ID
        return;
      }

      const clientId = (quotes[0] as { client: { id: string } }).client.id;

      const body = JSON.stringify({
        client_id: clientId,
        issue_date: today,
        expiry_date: expiry,
        currency: "EUR",
        terms_and_conditions: "E2E test quote — safe to delete",
        items: [
          {
            title: "E2E Test Service",
            quantity: "1",
            unit_price: { value: "100.00", currency: "EUR" },
            vat_rate: "20",
          },
        ],
      });

      const output = cli("--output", "json", "quote", "create", "--body", body);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id");
      expect(parsed).toHaveProperty("status");
      createdQuoteId = parsed["id"] as string;
    });

    it("shows the created quote", () => {
      if (createdQuoteId === undefined) {
        return;
      }

      const output = cli("--output", "json", "quote", "show", createdQuoteId);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      QuoteSchema.parse(parsed);
      expect(parsed).toHaveProperty("id", createdQuoteId);
      expect(parsed).toHaveProperty("items");
    });

    it("updates the created quote", () => {
      if (createdQuoteId === undefined) {
        return;
      }

      const body = JSON.stringify({
        header: "Updated by E2E test",
      });

      const output = cli("--output", "json", "quote", "update", createdQuoteId, "--body", body);
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("id", createdQuoteId);
    });

    it("deletes the created quote", () => {
      if (createdQuoteId === undefined) {
        return;
      }

      const output = cli("--output", "json", "quote", "delete", createdQuoteId, "--yes");
      const parsed = JSON.parse(output) as Record<string, unknown>;
      expect(parsed).toHaveProperty("deleted", true);
    });
  });

  describe("quote delete without --yes", () => {
    it("exits with error when --yes is not provided", () => {
      try {
        cli("quote", "delete", "00000000-0000-0000-0000-000000000000");
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
