// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { PaymentLinkSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cliJson, SKIP, skipIfNotFound } from "../helpers.js";
import { hasOAuthCredentials } from "../sandbox.js";

describe.skipIf(!hasOAuthCredentials())("payment-link commands (e2e)", () => {
  describe("payment-link list", () => {
    it("lists payment links", () => {
      // `payment-link` requires the Qonto Payment Links subscription to be
      // enabled on the organization. Sandboxes without it return HTTP 404 on
      // list endpoints — skip rather than fail (#490).
      const stdout = skipIfNotFound("payment-link", "list");
      if (stdout === SKIP) return;
      expect(stdout).toBeDefined();
    });

    it("produces valid JSON with --output json", () => {
      const stdout = skipIfNotFound("--output", "json", "payment-link", "list");
      if (stdout === SKIP) return;
      const parsed = JSON.parse(stdout) as unknown[];
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
      const stdout = skipIfNotFound("--output", "json", "payment-link", "list");
      if (stdout === SKIP) return;
      const links = JSON.parse(stdout) as { id: string }[];
      if (links.length === 0) return; // No payment links in sandbox

      const firstLink = links[0] as { id: string };
      const output = cliJson<unknown>("payment-link", "show", firstLink.id);

      // Show returns the full object in JSON mode
      const pl = (Array.isArray(output) ? output[0] : output) as Record<string, unknown>;
      PaymentLinkSchema.parse(pl);
      expect(pl).toHaveProperty("id", firstLink.id);
      expect(pl).toHaveProperty("status");
      expect(pl).toHaveProperty("url");
    });
  });

  describe("payment-link payments", () => {
    it("lists payments for a payment link", () => {
      const stdout = skipIfNotFound("--output", "json", "payment-link", "list");
      if (stdout === SKIP) return;
      const links = JSON.parse(stdout) as { id: string }[];
      if (links.length === 0) return; // No payment links in sandbox

      const firstLink = links[0] as { id: string };
      const parsed = cliJson<unknown[]>("payment-link", "payments", firstLink.id);
      expect(Array.isArray(parsed)).toBe(true);
    });
  });

  describe("payment-link methods", () => {
    it("lists available payment methods", () => {
      const parsed = cliJson<unknown[]>("payment-link", "methods");
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
      // The connection endpoint returns 404 when no payment-link connection
      // is established for the organization (sandbox default). Skip rather
      // than fail (#490).
      const stdout = skipIfNotFound("--output", "json", "payment-link", "connection-status");
      if (stdout === SKIP) return;
      const parsed = JSON.parse(stdout) as unknown;
      expect(parsed).toBeDefined();
    });
  });
});
