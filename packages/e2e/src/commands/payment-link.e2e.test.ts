// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 Oleksii PELYKH

import { PaymentLinkConnectionSchema, PaymentLinkSchema } from "@qontoctl/core";
import { describe, expect, it } from "vitest";
import { cliJson, cliRaw, qontoHttpStatus, SKIP, skipIfNotFound, skipMissingFixture } from "../helpers.js";
import { hasOAuthCredentials, pinAuthPreference } from "../sandbox.js";

describe.skipIf(!hasOAuthCredentials())("payment-link commands (e2e)", () => {
  pinAuthPreference("oauth-first");

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
    it("shows payment link details", (ctx) => {
      const stdout = skipIfNotFound("--output", "json", "payment-link", "list");
      if (stdout === SKIP) return;
      const links = JSON.parse(stdout) as { id: string }[];
      if (links.length === 0) {
        skipMissingFixture(ctx, "no payment links in sandbox to resolve an id for payment-link show");
      }

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
    it("lists payments for a payment link", (ctx) => {
      const stdout = skipIfNotFound("--output", "json", "payment-link", "list");
      if (stdout === SKIP) return;
      const links = JSON.parse(stdout) as { id: string }[];
      if (links.length === 0) {
        skipMissingFixture(ctx, "no payment links in sandbox to resolve an id for payment-link payments");
      }

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

  // Real lifecycle round-trip against the live sandbox — closes the audit gap
  // from umbrella #449 (Group 7): payment-link write paths (connect, create,
  // deactivate) were fully implemented but entirely uncovered by E2E. Sequential
  // `it` blocks share `createdPaymentLinkId` via closure, mirroring the pattern
  // in `packages/e2e/src/webhooks/cli.e2e.test.ts`.
  //
  // The flow is idempotent on setup: we probe `connection-status` first and
  // only attempt `connect` when no connection exists yet. Either path is a
  // success — what matters for AC compliance is that downstream `create` and
  // `deactivate` operate against a real connected state.
  describe("payment-link CRUD lifecycle", () => {
    let createdPaymentLinkId: string | undefined;
    let lifecycleSkipped = false;

    it("ensures a payment-link connection exists (idempotent setup)", () => {
      // 1. Probe current state as an optimization hint — 200 with any
      // non-empty status means a connection record already exists, in which
      // case the AC's "already connected" idempotency is satisfied without
      // calling `connect` at all. Any 4xx on the probe (404 = no connection
      // yet, 401 = OAuth scope/expiry, 403 = subscription gating) is
      // non-fatal: fall through to the connect step, whose own 4xx handling
      // surfaces the same outcome consistently.
      const statusProbe = cliRaw(["--output", "json", "payment-link", "connection-status"]);
      if (statusProbe.ok) {
        const current = JSON.parse(statusProbe.stdout) as { status?: string };
        if (typeof current.status === "string" && current.status.length > 0) {
          console.warn(`[e2e] payment-link connection already present (status=${current.status}); skipping connect`);
          return;
        }
      }

      // 2. No connection yet (or probe inconclusive) — try to establish one.
      // The connection partner is the first available bank account. The
      // sandbox does not actually open a browser flow, so `connect` either
      // returns a 200 with the connection URL or a 4xx surfacing
      // sandbox-feature gating; treat 4xx as a soft skip rather than a
      // regression.
      const accountListResult = cliRaw(["--output", "json", "account", "list"]);
      if (!accountListResult.ok) {
        const status = qontoHttpStatus(accountListResult.stderr);
        if (status !== undefined && status >= 400 && status < 500) {
          console.warn(
            `[e2e] skipping payment-link CRUD lifecycle: account list HTTP ${String(status)} (auth not configured)`,
          );
          lifecycleSkipped = true;
          return;
        }
        throw new Error(
          `account list failed unexpectedly: exit=${String(accountListResult.status)}\n--- stderr ---\n${accountListResult.stderr}`,
        );
      }
      const accounts = JSON.parse(accountListResult.stdout) as { id: string }[];
      const bankAccountId = accounts[0]?.id;
      if (bankAccountId === undefined) {
        console.warn("[e2e] skipping payment-link CRUD lifecycle: no bank account available");
        lifecycleSkipped = true;
        return;
      }

      const result = cliRaw([
        "--output",
        "json",
        "payment-link",
        "connect",
        "--body",
        JSON.stringify({
          partner_callback_url: "https://example.com/qontoctl-e2e-459",
          user_bank_account_id: bankAccountId,
          user_phone_number: "+33612345678",
          user_website_url: "https://example.com/qontoctl-e2e-459",
          business_description:
            "QontoCtl E2E test for payment-link write paths — issue #459. This is an automated test fixture and not a real business.",
        }),
      ]);

      if (!result.ok) {
        const status = qontoHttpStatus(result.stderr);
        if (status !== undefined && status >= 400 && status < 500) {
          console.warn(
            `[e2e] skipping payment-link connect: HTTP ${String(status)} (sandbox-feature gating or already connected)`,
          );
          lifecycleSkipped = true;
          return;
        }
        throw new Error(
          `payment-link connect failed unexpectedly: exit=${String(result.status)}\n--- stderr ---\n${result.stderr}`,
        );
      }

      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      PaymentLinkConnectionSchema.parse(parsed);
      expect(parsed).toHaveProperty("status");
      expect(parsed).toHaveProperty("bank_account_id");
    });

    it("creates a basket payment link", () => {
      if (lifecycleSkipped) return;

      // Discover an enabled payment method to satisfy the API contract; fall
      // back to "card" when the sandbox reports none enabled OR when the
      // `methods` endpoint itself transiently 4xx's (the endpoint is
      // informational — Qonto validates the chosen method server-side, so
      // proceeding with a known-supported default is safer than aborting the
      // lifecycle).
      const methodsResult = cliRaw(["--output", "json", "payment-link", "methods"]);
      const methods = methodsResult.ok
        ? (JSON.parse(methodsResult.stdout) as { name: string; enabled: boolean }[])
        : [];
      const enabled = methods.filter((m) => m.enabled).map((m) => m.name);
      const potentialMethods = enabled.length > 0 ? enabled.slice(0, 1) : ["card"];

      const body = {
        payment_link: {
          potential_payment_methods: potentialMethods,
          reusable: false,
          items: [
            {
              title: "QontoCtl E2E #459",
              quantity: 1,
              unit_price: { value: "1.00", currency: "EUR" },
              vat_rate: "0.0",
            },
          ],
        },
      };

      const result = cliRaw(["--output", "json", "payment-link", "create", "--body", JSON.stringify(body)]);

      if (!result.ok) {
        const status = qontoHttpStatus(result.stderr);
        if (status !== undefined && status >= 400 && status < 500) {
          console.warn(
            `[e2e] skipping payment-link create: HTTP ${String(status)} (sandbox-feature gating or connection not yet active)`,
          );
          lifecycleSkipped = true;
          return;
        }
        throw new Error(
          `payment-link create failed unexpectedly: exit=${String(result.status)}\n--- stderr ---\n${result.stderr}`,
        );
      }

      const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
      PaymentLinkSchema.parse(parsed);
      expect(parsed).toHaveProperty("id");
      expect(parsed).toHaveProperty("url");
      expect(parsed).toHaveProperty("status");
      createdPaymentLinkId = parsed["id"] as string;
    });

    it("deactivates the created payment link", () => {
      if (lifecycleSkipped || createdPaymentLinkId === undefined) return;

      const output = cliJson<Record<string, unknown>>("payment-link", "deactivate", createdPaymentLinkId, "--yes");
      PaymentLinkSchema.parse(output);
      expect(output).toHaveProperty("id", createdPaymentLinkId);
      // The deactivated link's status MUST flip away from `open`; the exact
      // post-deactivation label is API-defined (`canceled` per the docs) but
      // assert on the negative form so a future Qonto rename does not turn
      // this red on its own.
      expect(output["status"]).not.toBe("open");
    });
  });
});
