// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { PaymentLinkSchema } from "@qontoctl/core";
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

describe.skipIf(!hasCredentials())("payment-link commands (e2e)", () => {
  describe("payment-link list", () => {
    it("lists payment links", () => {
      const output = cli("payment-link", "list");
      expect(output).toBeDefined();
    });

    it("produces valid JSON with --output json", () => {
      const output = cli("--output", "json", "payment-link", "list");
      const parsed = JSON.parse(output) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
      for (const item of parsed) {
        const pl = item as Record<string, unknown>;
        expect(pl).toHaveProperty("id");
        expect(pl).toHaveProperty("status");
        expect(pl).toHaveProperty("amount");
        expect(pl).toHaveProperty("url");
      }
    });
  });

  describe("payment-link show", () => {
    it("shows payment link details", () => {
      const listOutput = cli("--output", "json", "payment-link", "list");
      const links = JSON.parse(listOutput) as { id: string }[];
      if (links.length === 0) {
        return; // No payment links in sandbox
      }

      const firstLink = links[0] as { id: string };
      const output = cli("--output", "json", "payment-link", "show", firstLink.id);
      const parsed = JSON.parse(output) as unknown;

      // Show returns the full object in JSON mode
      const pl = (Array.isArray(parsed) ? parsed[0] : parsed) as Record<string, unknown>;
      PaymentLinkSchema.parse(pl);
      expect(pl).toHaveProperty("id", firstLink.id);
      expect(pl).toHaveProperty("status");
      expect(pl).toHaveProperty("url");
    });
  });

  describe("payment-link payments", () => {
    it("lists payments for a payment link", () => {
      const listOutput = cli("--output", "json", "payment-link", "list");
      const links = JSON.parse(listOutput) as { id: string }[];
      if (links.length === 0) {
        return; // No payment links in sandbox
      }

      const firstLink = links[0] as { id: string };
      const output = cli("--output", "json", "payment-link", "payments", firstLink.id);
      const parsed = JSON.parse(output) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
    });
  });

  describe("payment-link methods", () => {
    it("lists available payment methods", () => {
      const output = cli("--output", "json", "payment-link", "methods");
      const parsed = JSON.parse(output) as unknown[];
      expect(Array.isArray(parsed)).toBe(true);
      for (const item of parsed) {
        const method = item as Record<string, unknown>;
        expect(method).toHaveProperty("name");
        expect(method).toHaveProperty("enabled");
      }
    });
  });

  describe("payment-link connection-status", () => {
    it("returns connection status", () => {
      const output = cli("--output", "json", "payment-link", "connection-status");
      const parsed = JSON.parse(output) as unknown;
      expect(parsed).toBeDefined();
    });
  });
});
