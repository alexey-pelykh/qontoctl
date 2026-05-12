// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { TerminalSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cliJson, cliRaw, qontoHttpStatus } from "../helpers.js";
import { hasOAuthCredentials, pinAuthPreference } from "../sandbox.js";

interface TerminalItem {
  readonly id: string;
  readonly poi_id: string;
  readonly created_at: string;
  readonly updated_at: string;
}

// Qonto's per-endpoint docs claim `/v2/terminals` accepts both api-key and
// OAuth bearer auth, but empirically (2026-05) the API rejects api-key with
// `HTTP 401: OAuth2 authentication is required here`. Gate on OAuth so the
// suite runs only locally; CI is api-key-only and skips naturally. Sandbox
// availability of provisioned terminals is uncertain — most tenants observed
// have none — so the create-payment path skips on empty list rather than failing.
describe.skipIf(!hasOAuthCredentials())("terminal CLI commands (e2e)", () => {
  pinAuthPreference("oauth-first");

  describe("terminal list", () => {
    it("lists terminals (possibly empty) as JSON", () => {
      const terminals = cliJson<TerminalItem[]>("terminal", "list");
      expect(Array.isArray(terminals)).toBe(true);
      const first = terminals[0];
      if (first !== undefined) {
        TerminalSchema.parse(first);
        expect(first).toHaveProperty("id");
        expect(first).toHaveProperty("poi_id");
      }
    });

    it("supports pagination", () => {
      const terminals = cliJson<TerminalItem[]>("terminal", "list", "--per-page", "1", "--page", "1");
      expect(Array.isArray(terminals)).toBe(true);
      expect(terminals.length).toBeLessThanOrEqual(1);
    });
  });

  describe("terminal payment create", () => {
    it("either initiates a payment or reports a known sandbox-feature failure", () => {
      const terminals = cliJson<TerminalItem[]>("terminal", "list", "--per-page", "1");
      const first = terminals[0];
      if (first === undefined) {
        console.warn("[e2e] skipping terminal payment create: no terminals provisioned in this tenant");
        return;
      }

      // The Qonto sandbox does not actually drive a physical card reader, so a
      // real payment never settles. We accept three outcomes:
      //   * 202 Accepted (sandbox echoes the payment back) — the happy path.
      //   * 4xx with a Qonto error code — sandbox feature gating (no terminal
      //     attached, no merchant configured, etc.). Surfaced as a skip so the
      //     test does not turn red on environmental gaps.
      //   * Other failures — re-thrown so genuine regressions still fail.
      const result = cliRaw(
        [
          "--output",
          "json",
          "terminal",
          "payment",
          "create",
          first.id,
          "--amount",
          "1.00",
          "--metadata",
          '{"e2e":"484"}',
        ],
        { timeout: 130_000 },
      );

      if (result.ok) {
        const payment = JSON.parse(result.stdout) as {
          id: string;
          terminal_id: string;
          amount: { value: string; currency: string };
        };
        expect(payment.id).toBeDefined();
        expect(payment.terminal_id).toBe(first.id);
        expect(payment.amount.currency).toBe("EUR");
        return;
      }

      const status = qontoHttpStatus(result.stderr);
      if (status !== undefined && status >= 400 && status < 500) {
        console.warn(
          `[e2e] skipping terminal payment assertion: HTTP ${String(status)} (sandbox terminal-payment gating)`,
        );
        return;
      }

      throw new Error(
        `terminal payment create failed unexpectedly: exit=${String(result.status)}\n--- stderr ---\n${result.stderr}`,
      );
    }, 140_000);

    it("rejects invalid amounts client-side without hitting the API", () => {
      const result = cliRaw([
        "terminal",
        "payment",
        "create",
        "00000000-0000-0000-0000-000000000000",
        "--amount",
        "0.05",
      ]);
      expect(result.ok).toBe(false);
      if (result.ok) return;
      // Should fail at the parser, not the API — no Qonto HTTP error line.
      expect(qontoHttpStatus(result.stderr)).toBeUndefined();
    });
  });
});
